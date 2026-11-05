"""Accounts, their passwords and roles, and the sessions of those signed in.

Accounts live in SQLite in the server's data directory. Sessions live only in
memory: they end when the server restarts, which on the device means a reboot
or an update, and a request never writes to the device's storage just to note
that a session was used. Their lifetimes run on the monotonic clock, since the
device may have no real-time clock and its wall clock jumps when it is set.
"""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass, replace
from enum import StrEnum
from pathlib import Path
from typing import Any, Literal


class Role(StrEnum):
    VIEWER = "viewer"
    OPERATOR = "operator"
    ADMIN = "admin"


# Each role may do everything the ones before it may.
RANK = {Role.VIEWER: 0, Role.OPERATOR: 1, Role.ADMIN: 2}

# scrypt's cost: 2**14 rounds over 8 blocks takes 16 MiB, which a device has
# to spare, for each sign-in. The cost is stored with each hash, so raising it
# later leaves existing passwords working.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1

# A hash takes about half a second on a device. Sign-ins run on a pool of
# threads, so without a cap a burst of them would hash side by side, each
# taking its 16 MiB, and slow every one; past the cap they wait their turn.
HASHES_AT_ONCE = 2
_hashing = threading.BoundedSemaphore(HASHES_AT_ONCE)
# The pool's threads also serve the readings and the page, so a sign-in waits
# only this long for a turn before it is turned away, and told when to try again.
HASH_WAIT_S = 1.0
BUSY_RETRY_S = 5.0

NAME_MAX = 64
PASSWORD_MIN = 8
# Long enough for any passphrase, short enough that hashing one costs nothing extra.
PASSWORD_MAX = 1024

# A session ends after a week unused, and after thirty days whatever happens.
IDLE_S = 7 * 24 * 3600
LIFETIME_S = 30 * 24 * 3600

# Sign-in is refused for a while after this many failures within the window,
# for one account name, or from one address across all names.
FAILURES_PER_NAME = 5
FAILURES_PER_ADDRESS = 20
FAILURE_WINDOW_S = 15 * 60

# The setup code is read off the device and typed in, so it leaves out letters
# and digits that look alike: 12 of these 32 are 60 bits.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 12

SCHEMA = """
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    password TEXT NOT NULL
);
"""
# Each version of the database after the first, and what it adds. A change
# names its account rather than pointing at it, so it outlasts the account.
# Its time is the wall clock's, which may not have been set when it was made,
# so the order the changes were made in is that of their ids.
UPGRADES = [
    """
    CREATE TABLE changes (
        id INTEGER PRIMARY KEY,
        at REAL NOT NULL,
        account TEXT NOT NULL,
        control TEXT NOT NULL,
        instance INTEGER,
        old TEXT,
        new TEXT NOT NULL,
        outcome TEXT NOT NULL,
        reason TEXT
    );
    """,
    # What the device reported after a change, which can differ from what
    # was written, and the highest an admin lets a control be set to.
    """
    ALTER TABLE changes ADD COLUMN reported TEXT;
    CREATE TABLE ceilings (
        control TEXT PRIMARY KEY,
        value REAL NOT NULL
    );
    """,
]


class AccountError(ValueError):
    """A change to the accounts that cannot be made, with a reason a user can read."""


class Conflict(AccountError):
    """A change that clashes with the accounts as they stand."""


class WrongPassword(AccountError):
    """A name and password that do not match an account."""


@dataclass(frozen=True)
class Account:
    id: int
    name: str
    role: Role

    def may(self, role: Role) -> bool:
        return RANK[self.role] >= RANK[role]


@dataclass
class Session:
    account_id: int
    csrf: str
    started: float
    seen: float


Outcome = Literal["confirmed", "unconfirmed", "refused"]


@dataclass(frozen=True)
class Change:
    """A change an account asked a control to make on the device, and what came of it."""
    at: float
    account: str
    control: str
    instance: int | None
    old: Any
    new: Any
    # Confirmed once the device reported on the value after it was written,
    # unconfirmed if it had not within the wait, refused if it was never sent.
    outcome: Outcome
    reason: str | None = None
    # The value as the device last reported it, which it may have changed from new.
    reported: Any = None
    id: int | None = None


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = bytes.fromhex(digest)
        actual = _scrypt(password, bytes.fromhex(salt), int(n), int(r), int(p))
    except ValueError:
        return False
    return hmac.compare_digest(actual, expected)


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    # OpenSSL refuses more than 32 MiB unless told otherwise; this allows what the cost needs.
    if not _hashing.acquire(timeout=HASH_WAIT_S):
        raise TooManyAttempts(BUSY_RETRY_S)
    try:
        return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=32,
                              maxmem=128 * r * (n + p + 2) + 1024 * 1024)
    finally:
        _hashing.release()


# Checked when a name has no account, so a wrong name takes as long as a wrong password.
_NOBODY = hash_password(secrets.token_hex(16))


def new_setup_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def _is_code(text: str) -> bool:
    return len(text) == CODE_LENGTH and all(character in CODE_ALPHABET for character in text)


def _code_key(code: str) -> str:
    # Typed in by hand: case, spaces and dashes do not matter.
    return "".join(code.split()).replace("-", "").upper()


class Failures:
    """Recent failed attempts by key, forgetting those older than the window."""

    def __init__(self, clock: Callable[[], float]) -> None:
        self.clock = clock
        self._times: defaultdict[str, deque[float]] = defaultdict(deque)

    def count(self, key: str) -> int:
        times = self._times.get(key)
        if times is None:
            return 0
        while times and times[0] <= self.clock() - FAILURE_WINDOW_S:
            times.popleft()
        if not times:
            del self._times[key]
            return 0
        return len(times)

    def retry_after(self, key: str) -> float:
        times = self._times.get(key)
        return max(0.0, times[0] + FAILURE_WINDOW_S - self.clock()) if times else 0.0

    def add(self, key: str) -> None:
        self._times[key].append(self.clock())

    def clear(self, key: str) -> None:
        self._times.pop(key, None)


class TooManyAttempts(Exception):
    def __init__(self, retry_after: float) -> None:
        super().__init__("too many attempts")
        self.retry_after = retry_after


class Accounts:
    """The accounts in the database at path, or in memory without one, and the sessions open on them.

    With no account yet, the first one needs the setup code, which is kept in
    setup_file when there is one, so that only someone who can read the
    device's files can make the install's admin.
    """

    def __init__(self, path: Path | None = None, setup_file: Path | None = None,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self.clock = clock
        self.path = path
        self.setup_file = setup_file
        self._lock = threading.Lock()
        self._connection: sqlite3.Connection | None = None
        self._sessions: dict[str, Session] = {}
        self._failures = Failures(clock)
        self._code: str | None = None

    @property
    def _db(self) -> sqlite3.Connection:
        # Opened on first use rather than when made, so that the database
        # belongs to the account the server runs as, not to root, which it
        # starts as to read its TLS key. Always used under the lock.
        if self._connection is None:
            if self.path is not None:
                self.path.parent.mkdir(parents=True, exist_ok=True)
            db = sqlite3.connect(":memory:" if self.path is None else self.path, check_same_thread=False,
                                 isolation_level=None)
            # The device can lose power at any moment: WAL with full syncs
            # keeps the database whole and every committed change in it.
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("PRAGMA synchronous=FULL")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version == 0:
                db.executescript(f"BEGIN; {SCHEMA} PRAGMA user_version = 1; COMMIT;")
                version = 1
            for number, upgrade in enumerate(UPGRADES[version - 1:], start=version + 1):
                db.executescript(f"BEGIN; {upgrade} PRAGMA user_version = {number}; COMMIT;")
            self._connection = db
        return self._connection

    def close(self) -> None:
        with self._lock:
            if self._connection is not None:
                self._connection.close()
                self._connection = None

    # The first account

    def setup_needed(self) -> bool:
        with self._lock:
            return self._count() == 0

    def setup_code(self) -> str | None:
        """The code that creating the first account needs, made and kept when first asked for, or None once there is one."""
        with self._lock:
            if self._count() > 0:
                return None
            if self._code is None:
                kept = self._read_code()
                if kept is not None:
                    self._code = kept
                else:
                    self._code = new_setup_code()
                    if self.setup_file is not None:
                        self._write_private(self.setup_file, self._code + "\n")
            return self._code

    def _read_code(self) -> str | None:
        # Only a whole code counts: a file left empty or cut short, as a power
        # cut can leave it, would otherwise let anyone in with what it holds.
        if self.setup_file is None or not self.setup_file.is_file():
            return None
        try:
            text = self.setup_file.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeDecodeError):
            return None
        return text if _is_code(text) else None

    def create_first(self, code: str, name: str, password: str, address: str) -> Account:
        """Creates the first account, as an admin, if code is the setup code."""
        key = f"address:{address}"
        self._check_attempts([key], FAILURES_PER_ADDRESS)
        expected = self.setup_code()
        if expected is None:
            raise Conflict("This server already has its first account.")
        if not hmac.compare_digest(_code_key(code).encode(), _code_key(expected).encode()):
            with self._lock:
                self._failures.add(key)
            raise AccountError("That setup code is not right.")
        account = self.create(name, password, Role.ADMIN, first=True)
        with self._lock:
            self._code = None
        if self.setup_file is not None:
            self.setup_file.unlink(missing_ok=True)
        return account

    # Accounts

    def create(self, name: str, password: str, role: Role, first: bool = False) -> Account:
        name = _clean_name(name)
        check_new_password(password)
        hashed = hash_password(password)
        with self._lock, self._transaction():
            if first and self._count() > 0:
                raise Conflict("This server already has its first account.")
            try:
                cursor = self._db.execute(
                    "INSERT INTO accounts (name, name_key, role, password) VALUES (?, ?, ?, ?)",
                    (name, name.casefold(), role.value, hashed))
            except sqlite3.IntegrityError:
                raise Conflict(f"There is already an account called {name}.") from None
            assert cursor.lastrowid is not None
            return Account(cursor.lastrowid, name, role)

    def all(self) -> list[Account]:
        with self._lock:
            rows = self._db.execute("SELECT id, name, role FROM accounts ORDER BY name_key").fetchall()
        return [Account(row[0], row[1], Role(row[2])) for row in rows]

    def find(self, name: str) -> Account | None:
        with self._lock:
            row = self._db.execute("SELECT id, name, role FROM accounts WHERE name_key = ?",
                                   (name.strip().casefold(),)).fetchone()
        return None if row is None else Account(row[0], row[1], Role(row[2]))

    def set_role(self, account: Account, role: Role) -> Account:
        return self.change(account, role=role)

    def set_password(self, account: Account, password: str, keep: str | None = None) -> None:
        """Sets account's password and ends its sessions, all but the one whose token is keep."""
        self.change(account, password=password, keep=keep)

    def change(self, account: Account, role: Role | None = None, password: str | None = None,
               keep: str | None = None) -> Account:
        """Changes account's role, its password or both, making either change only if both can be made."""
        # Hashing can be turned away when it is busy, so it is done before anything is changed.
        hashed = None
        if password is not None:
            check_new_password(password)
            hashed = hash_password(password)
        with self._lock, self._transaction():
            if role is not None:
                if account.role == Role.ADMIN and role != Role.ADMIN:
                    self._keep_an_admin(account)
                self._db.execute("UPDATE accounts SET role = ? WHERE id = ?", (role.value, account.id))
            if hashed is not None:
                self._db.execute("UPDATE accounts SET password = ? WHERE id = ?", (hashed, account.id))
                self._end_sessions(account.id, keep=None if keep is None else _token_key(keep))
        return Account(account.id, account.name, account.role if role is None else role)

    def remove(self, account: Account) -> None:
        with self._lock, self._transaction():
            if account.role == Role.ADMIN:
                self._keep_an_admin(account)
            self._db.execute("DELETE FROM accounts WHERE id = ?", (account.id,))
            self._end_sessions(account.id)

    # Signing in

    def sign_in(self, name: str, password: str, address: str) -> tuple[str, Account]:
        """A new session's token and its account, if password is name's."""
        account = self.check(name, password, address)
        return self.open_session(account), account

    def check(self, name: str, password: str, address: str) -> Account:
        """name's account, if password is its password, counting a wrong one toward the limits."""
        keys = [f"name:{name.strip().casefold()}", f"address:{address}"]
        self._check_attempts(keys[:1], FAILURES_PER_NAME)
        self._check_attempts(keys[1:], FAILURES_PER_ADDRESS)
        with self._lock:
            row = self._db.execute("SELECT id, name, role, password FROM accounts WHERE name_key = ?",
                                   (name.strip().casefold(),)).fetchone()
        right = check_password(password, row[3] if row is not None else _NOBODY)
        if row is None or not right:
            with self._lock:
                for key in keys:
                    self._failures.add(key)
            raise WrongPassword("Wrong name or password.")
        with self._lock:
            self._failures.clear(keys[0])
        return Account(row[0], row[1], Role(row[2]))

    def open_session(self, account: Account) -> str:
        token = secrets.token_urlsafe(32)
        now = self.clock()
        with self._lock:
            self._sessions[_token_key(token)] = Session(account.id, secrets.token_urlsafe(32), now, now)
        return token

    def session(self, token: str | None) -> tuple[Session, Account] | None:
        """The session token opened and its account, if both are still current."""
        if not token:
            return None
        key = _token_key(token)
        now = self.clock()
        with self._lock:
            session = self._sessions.get(key)
            if session is None:
                return None
            if now - session.seen > IDLE_S or now - session.started > LIFETIME_S:
                del self._sessions[key]
                return None
            row = self._db.execute("SELECT id, name, role FROM accounts WHERE id = ?",
                                   (session.account_id,)).fetchone()
            if row is None:
                del self._sessions[key]
                return None
            session.seen = now
        return session, Account(row[0], row[1], Role(row[2]))

    def sign_out(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(_token_key(token), None)

    # Changes made on the device

    def record_change(self, change: Change) -> Change:
        """Adds change to the history, which keeps every one, and returns it with its id."""
        with self._lock, self._transaction():
            cursor = self._db.execute(
                "INSERT INTO changes (at, account, control, instance, old, new, outcome, reason, reported)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (change.at, change.account, change.control, change.instance, _json(change.old),
                 json.dumps(change.new), change.outcome, change.reason, _json(change.reported)))
        return replace(change, id=cursor.lastrowid)

    def changes(self, before: int | None = None, limit: int = 100) -> list[Change]:
        """The changes made before the one whose id is before, or the latest ones, newest first."""
        with self._lock:
            rows = self._db.execute(
                "SELECT id, at, account, control, instance, old, new, outcome, reason, reported FROM changes"
                " WHERE id < ? ORDER BY id DESC LIMIT ?",
                (before if before is not None else 2**63 - 1, limit)).fetchall()
        return [Change(at=row[1], account=row[2], control=row[3], instance=row[4], old=_unjson(row[5]),
                       new=_unjson(row[6]), outcome=row[7], reason=row[8], reported=_unjson(row[9]), id=row[0])
                for row in rows]

    def ceiling(self, control: str) -> float | None:
        """The highest an admin lets control be set to, if one has been set."""
        with self._lock:
            row = self._db.execute("SELECT value FROM ceilings WHERE control = ?", (control,)).fetchone()
        return None if row is None else row[0]

    def set_ceiling(self, control: str, value: float | None) -> None:
        with self._lock, self._transaction():
            if value is None:
                self._db.execute("DELETE FROM ceilings WHERE control = ?", (control,))
            else:
                self._db.execute("INSERT INTO ceilings (control, value) VALUES (?, ?)"
                                 " ON CONFLICT (control) DO UPDATE SET value = excluded.value", (control, value))

    # Inside

    def _count(self) -> int:
        return self._db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]

    def _keep_an_admin(self, account: Account) -> None:
        others = self._db.execute("SELECT COUNT(*) FROM accounts WHERE role = ? AND id != ?",
                                  (Role.ADMIN.value, account.id)).fetchone()[0]
        if others == 0:
            raise Conflict("This is the only admin account. Make another account an admin first.")

    def _end_sessions(self, account_id: int, keep: str | None = None) -> None:
        for key in [key for key, session in self._sessions.items()
                    if session.account_id == account_id and key != keep]:
            del self._sessions[key]

    def _check_attempts(self, keys: Iterable[str], limit: int) -> None:
        with self._lock:
            for key in keys:
                if self._failures.count(key) >= limit:
                    raise TooManyAttempts(self._failures.retry_after(key))

    def _transaction(self) -> "_Transaction":
        return _Transaction(self._db)

    @staticmethod
    def _write_private(path: Path, text: str) -> None:
        # Readable by the server's own account alone, from the moment it exists.
        path.parent.mkdir(parents=True, exist_ok=True)
        path.unlink(missing_ok=True)
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as file:
            file.write(text)
            file.flush()
            os.fsync(file.fileno())


class _Transaction:
    def __init__(self, db: sqlite3.Connection) -> None:
        self.db = db

    def __enter__(self) -> None:
        self.db.execute("BEGIN IMMEDIATE")

    def __exit__(self, kind: object, *_: object) -> None:
        self.db.execute("COMMIT" if kind is None else "ROLLBACK")


def _json(value: Any) -> str | None:
    return None if value is None else json.dumps(value)


def _unjson(text: str | None) -> Any:
    return None if text is None else json.loads(text)


def _token_key(token: str) -> str:
    # Only a hash of each token is kept, so the sessions in memory cannot be
    # used to sign in as anyone.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _clean_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise AccountError("An account needs a name.")
    if len(name) > NAME_MAX:
        raise AccountError(f"An account's name can be at most {NAME_MAX} characters.")
    if any(not character.isprintable() for character in name):
        raise AccountError("An account's name can only have characters that print.")
    # A name is one part of an account's address, /api/accounts/<name>.
    if "/" in name or name in (".", ".."):
        raise AccountError("An account's name cannot have a slash in it, or be . or ..")
    return name


def check_new_password(password: str) -> None:
    if len(password) < PASSWORD_MIN:
        raise AccountError(f"A password needs at least {PASSWORD_MIN} characters.")
    if len(password) > PASSWORD_MAX:
        raise AccountError(f"A password can be at most {PASSWORD_MAX} characters.")

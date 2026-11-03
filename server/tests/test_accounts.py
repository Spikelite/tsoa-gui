import stat
import sys
import threading
import time
from pathlib import Path

import pytest

from tsoa_gui.accounts import (
    FAILURE_WINDOW_S, FAILURES_PER_ADDRESS, FAILURES_PER_NAME, HASHES_AT_ONCE, IDLE_S, LIFETIME_S, AccountError,
    Accounts, Conflict,
    Role, TooManyAttempts, WrongPassword, check_password, hash_password,
)

PASSWORD = "correct horse"


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def accounts(clock: Clock) -> Accounts:
    return Accounts(clock=clock)


def test_a_password_checks_against_its_own_hash_only():
    stored = hash_password(PASSWORD)
    assert stored.startswith("scrypt$")
    assert check_password(PASSWORD, stored)
    assert not check_password("wrong horse", stored)
    assert hash_password(PASSWORD) != stored  # salted
    assert not check_password(PASSWORD, "not a hash")


def test_only_a_few_passwords_are_hashed_at_once(monkeypatch: pytest.MonkeyPatch):
    running = []
    most = []

    def slow_scrypt(*_: object, **__: object) -> bytes:
        running.append(1)
        most.append(len(running))
        time.sleep(0.05)
        running.pop()
        return bytes(32)

    monkeypatch.setattr("tsoa_gui.accounts.hashlib.scrypt", slow_scrypt)
    threads = [threading.Thread(target=hash_password, args=(PASSWORD,)) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert max(most) == HASHES_AT_ONCE


def test_the_first_account_needs_the_setup_code_and_is_an_admin(tmp_path: Path):
    setup_file = tmp_path / "var" / "setup-code"
    accounts = Accounts(tmp_path / "accounts.db", setup_file)
    assert accounts.setup_needed()
    code = accounts.setup_code()
    assert code is not None and setup_file.read_text(encoding="utf-8").strip() == code
    if sys.platform != "win32":
        assert stat.S_IMODE(setup_file.stat().st_mode) == 0o600

    with pytest.raises(AccountError):
        accounts.create_first("WRONGWRONGXX", "owner", PASSWORD, "192.0.2.10")
    # Typed by hand: case, spaces and dashes do not matter.
    typed = f"{code[:4].lower()}-{code[4:8]} {code[8:]}"
    first = accounts.create_first(typed, "owner", PASSWORD, "192.0.2.10")
    assert first.role == Role.ADMIN
    assert not accounts.setup_needed()
    assert accounts.setup_code() is None
    assert not setup_file.exists()
    with pytest.raises(Conflict):
        accounts.create_first(code, "another", PASSWORD, "192.0.2.10")


@pytest.mark.parametrize("left", ["", "   \n", "ABC", "not a code at all"])
def test_a_setup_code_file_left_broken_is_replaced(tmp_path: Path, left: str):
    # As a power cut just after the file was made can leave it.
    (tmp_path / "setup-code").write_text(left, encoding="utf-8")
    accounts = Accounts(tmp_path / "accounts.db", tmp_path / "setup-code")
    code = accounts.setup_code()
    assert code is not None and len(code) == 12 and code != left.strip()
    assert (tmp_path / "setup-code").read_text(encoding="utf-8").strip() == code
    with pytest.raises(AccountError):
        accounts.create_first(left, "owner", PASSWORD, "192.0.2.10")


def test_a_sign_in_waits_only_a_while_for_a_turn_to_hash(monkeypatch: pytest.MonkeyPatch):
    from tsoa_gui import accounts as module
    monkeypatch.setattr(module, "HASH_WAIT_S", 0.05)
    held = [module._hashing.acquire() for _ in range(HASHES_AT_ONCE)]
    try:
        with pytest.raises(TooManyAttempts) as refused:
            hash_password(PASSWORD)
        assert refused.value.retry_after > 0
    finally:
        for _ in held:
            module._hashing.release()
    assert check_password(PASSWORD, hash_password(PASSWORD))


def test_the_setup_code_outlives_a_restart(tmp_path: Path):
    code = Accounts(tmp_path / "accounts.db", tmp_path / "setup-code").setup_code()
    assert Accounts(tmp_path / "accounts.db", tmp_path / "setup-code").setup_code() == code


def test_accounts_outlive_a_restart_and_sessions_do_not(tmp_path: Path):
    before = Accounts(tmp_path / "accounts.db")
    before.create("owner", PASSWORD, Role.ADMIN)
    token, _ = before.sign_in("owner", PASSWORD, "192.0.2.10")
    before.close()
    after = Accounts(tmp_path / "accounts.db")
    assert [account.name for account in after.all()] == ["owner"]
    assert after.session(token) is None


def test_guessing_the_setup_code_is_limited(accounts: Accounts):
    for _ in range(FAILURES_PER_ADDRESS):
        with pytest.raises(AccountError):
            accounts.create_first("WRONGWRONGXX", "owner", PASSWORD, "192.0.2.10")
    with pytest.raises(TooManyAttempts):
        accounts.create_first(accounts.setup_code() or "", "owner", PASSWORD, "192.0.2.10")


def test_signs_in_by_name_in_any_case(accounts: Accounts):
    accounts.create("Owner", PASSWORD, Role.OPERATOR)
    token, account = accounts.sign_in(" owner ", PASSWORD, "192.0.2.10")
    current = accounts.session(token)
    assert current is not None and current[1] == account and account.name == "Owner"
    with pytest.raises(WrongPassword):
        accounts.sign_in("owner", "wrong horse", "192.0.2.10")
    with pytest.raises(WrongPassword):
        accounts.sign_in("nobody", PASSWORD, "192.0.2.10")


def test_names_are_unique_whatever_their_case(accounts: Accounts):
    accounts.create("Owner", PASSWORD, Role.ADMIN)
    with pytest.raises(Conflict):
        accounts.create("OWNER", PASSWORD, Role.VIEWER)


@pytest.mark.parametrize(("name", "password"), [
    ("", PASSWORD), ("x" * 65, PASSWORD), ("tab\there", PASSWORD), ("a/b", PASSWORD), (".", PASSWORD),
    ("..", PASSWORD), ("owner", "short"), ("owner", "x" * 1025),
])
def test_refuses_a_bad_name_or_password(accounts: Accounts, name: str, password: str):
    with pytest.raises(AccountError):
        accounts.create(name, password, Role.VIEWER)


def test_wrong_passwords_lock_a_name_for_a_while(accounts: Accounts, clock: Clock):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    for _ in range(FAILURES_PER_NAME):
        with pytest.raises(WrongPassword):
            accounts.sign_in("owner", "wrong horse", "192.0.2.10")
    # Even the right password, from anywhere, until the window has passed.
    with pytest.raises(TooManyAttempts) as refused:
        accounts.sign_in("owner", PASSWORD, "192.0.2.20")
    assert 0 < refused.value.retry_after <= FAILURE_WINDOW_S
    clock.now += FAILURE_WINDOW_S
    accounts.sign_in("owner", PASSWORD, "192.0.2.20")


def test_wrong_passwords_lock_an_address_across_names(accounts: Accounts):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    for attempt in range(FAILURES_PER_ADDRESS):
        with pytest.raises(WrongPassword):
            accounts.sign_in(f"guess{attempt}", PASSWORD, "192.0.2.10")
    with pytest.raises(TooManyAttempts):
        accounts.sign_in("owner", PASSWORD, "192.0.2.10")
    accounts.sign_in("owner", PASSWORD, "192.0.2.20")


def test_a_session_ends_when_unused_for_a_while(accounts: Accounts, clock: Clock):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    token, _ = accounts.sign_in("owner", PASSWORD, "192.0.2.10")
    clock.now += IDLE_S - 1
    assert accounts.session(token) is not None
    clock.now += IDLE_S - 1
    assert accounts.session(token) is not None
    clock.now += IDLE_S + 1
    assert accounts.session(token) is None


def test_a_session_ends_after_its_lifetime_however_much_it_is_used(accounts: Accounts, clock: Clock):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    token, _ = accounts.sign_in("owner", PASSWORD, "192.0.2.10")
    while clock.now < 1000.0 + LIFETIME_S:
        assert accounts.session(token) is not None
        clock.now += IDLE_S / 2
    assert accounts.session(token) is None


def test_signing_out_ends_the_session(accounts: Accounts):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    token, _ = accounts.sign_in("owner", PASSWORD, "192.0.2.10")
    accounts.sign_out(token)
    assert accounts.session(token) is None


def test_a_session_follows_its_account(accounts: Accounts):
    admin = accounts.create("owner", PASSWORD, Role.ADMIN)
    crew = accounts.create("crew", PASSWORD, Role.OPERATOR)
    one, _ = accounts.sign_in("crew", PASSWORD, "192.0.2.10")
    other, _ = accounts.sign_in("crew", PASSWORD, "192.0.2.20")
    # A new role holds at once.
    accounts.set_role(crew, Role.VIEWER)
    current = accounts.session(one)
    assert current is not None and current[1].role == Role.VIEWER
    # A new password ends every session but the one that set it.
    accounts.set_password(crew, "battery staple", keep=one)
    assert accounts.session(one) is not None and accounts.session(other) is None
    # And a removed account's sessions end with it.
    accounts.remove(crew)
    assert accounts.session(one) is None
    assert [account.name for account in accounts.all()] == [admin.name]


def test_always_keeps_an_admin(accounts: Accounts):
    owner = accounts.create("owner", PASSWORD, Role.ADMIN)
    with pytest.raises(Conflict):
        accounts.set_role(owner, Role.OPERATOR)
    with pytest.raises(Conflict):
        accounts.remove(owner)
    accounts.create("second", PASSWORD, Role.ADMIN)
    accounts.set_role(owner, Role.OPERATOR)
    assert accounts.find("owner") is not None and accounts.find("owner").role == Role.OPERATOR


def test_only_a_hash_of_each_token_is_kept(accounts: Accounts):
    accounts.create("owner", PASSWORD, Role.ADMIN)
    token, _ = accounts.sign_in("owner", PASSWORD, "192.0.2.10")
    assert token not in repr(accounts.__dict__)

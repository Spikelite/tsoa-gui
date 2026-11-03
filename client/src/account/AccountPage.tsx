import { useEffect, useState, type FormEvent } from "react";

import {
  changeAccount, changeOwnPassword, createAccount, listAccounts, Refused, removeAccount, ROLES, signOut,
  type AccountInfo, type Role, type SessionState,
} from "./api";
import { AccountFrame, Field, Problem } from "./parts";
import { PASSWORD_MIN, useSession, waitingWords } from "./session";

const roleName = (role: Role) => ROLES.find((option) => option.id === role)?.name ?? role;

const why = (error: unknown) => (error instanceof Refused ? error.message : String(error));

// The signed-in account, at /account: its password, signing out, and, for an
// admin, every account on the server.
export function AccountPage({ go = (address: string) => window.location.assign(address) }: {
  go?: (address: string) => void;
}) {
  const { session, unreachable } = useSession();

  if (session === null) {
    return <AccountFrame title="Account"><p className="account-note">{waitingWords(unreachable)}</p></AccountFrame>;
  }
  if (session.account === null || session.csrf === null) {
    return (
      <AccountFrame title="Account">
        <p className="account-note">You are not signed in. <a href="/login?next=/account">Sign in</a></p>
      </AccountFrame>
    );
  }
  const { account, csrf } = session;
  return (
    <AccountFrame title={account.name}>
      <p className="account-note">
        {roleName(account.role)}: {ROLES.find((option) => option.id === account.role)?.does}.{" "}
        <a href="/">Back to the readings</a>
      </p>
      <OwnPassword csrf={csrf} />
      {account.role === "admin" && <Accounts session={session} />}
      <section className="account-section">
        <button type="button" onClick={() => void signOut(csrf).finally(() => go("/"))}>Sign out</button>
      </section>
    </AccountFrame>
  );
}

function OwnPassword({ csrf }: { csrf: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setDone(false);
    if (password !== again) {
      setProblem("The two new passwords are not the same.");
      return;
    }
    setProblem(null);
    try {
      await changeOwnPassword(csrf, current, password);
      setCurrent("");
      setPassword("");
      setAgain("");
      setDone(true);
    } catch (error) {
      setProblem(why(error));
    }
  };

  return (
    <section className="account-section">
      <h2>Your password</h2>
      <form className="account-form" onSubmit={submit}>
        <Field label="Current password" value={current} onChange={setCurrent} type="password"
          autoComplete="current-password" />
        <Field label="New password" value={password} onChange={setPassword} type="password"
          autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters. Anywhere else you are signed in is signed out.`} />
        <Field label="New password again" value={again} onChange={setAgain} type="password"
          autoComplete="new-password" />
        <Problem text={problem} />
        {done && <p className="account-done" role="status">Your password is changed.</p>}
        <button type="submit" disabled={!current || password.length < PASSWORD_MIN || !again}>Change it</button>
      </form>
    </section>
  );
}

function Accounts({ session }: { session: SessionState }) {
  const csrf = session.csrf!;
  const [accounts, setAccounts] = useState<AccountInfo[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Counts the changes made, so the list is loaded again after each.
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    let current = true;
    listAccounts(csrf).then(
      (answer) => current && setAccounts(answer),
      (error: unknown) => current && setProblem(why(error)),
    );
    return () => {
      current = false;
    };
  }, [csrf, changes]);

  // Whether the change took, so a form keeps what was typed when it did not.
  const act = async (change: Promise<unknown>) => {
    setProblem(null);
    let took = true;
    try {
      await change;
    } catch (error) {
      setProblem(why(error));
      took = false;
    }
    setChanges((count) => count + 1);
    return took;
  };

  return (
    <section className="account-section">
      <h2>Accounts</h2>
      <Problem text={problem} />
      {accounts === null ? (
        <p className="account-note">Loading the accounts.</p>
      ) : (
        <ul className="account-list">
          {accounts.map((other) => (
            <AccountRow key={other.name} other={other} self={other.name === session.account?.name}
              onRole={(role) => act(changeAccount(csrf, other.name, { role }))}
              onPassword={(password) => act(changeAccount(csrf, other.name, { password }))}
              onRemove={() => act(removeAccount(csrf, other.name))} />
          ))}
        </ul>
      )}
      <NewAccount onCreate={(name, password, role) => act(createAccount(csrf, name, password, role))} />
    </section>
  );
}

function AccountRow({ other, self, onRole, onPassword, onRemove }: {
  other: AccountInfo;
  self: boolean;
  onRole: (role: Role) => Promise<boolean>;
  onPassword: (password: string) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <li className="account-row">
      <span className="account-name">{other.name}{self && " (you)"}</span>
      <label className="account-role">
        <span className="account-quiet">Role of {other.name}</span>
        {/* Another admin changes yours, so nobody takes away the page they are using. */}
        <select value={other.role} disabled={self} onChange={(event) => void onRole(event.target.value as Role)}>
          {ROLES.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </label>
      {!self && (
        <>
          <button type="button" onClick={() => setResetting(!resetting)}>New password</button>
          <button type="button" onClick={() => {
            if (window.confirm(`Remove the account ${other.name}?`)) {
              void onRemove();
            }
          }}>Remove</button>
        </>
      )}
      {resetting && (
        <form className="account-form account-reset" onSubmit={(event) => {
          event.preventDefault();
          void onPassword(password).then((took) => {
            if (took) {
              setPassword("");
              setResetting(false);
            }
          });
        }}>
          <Field label={`New password for ${other.name}`} value={password} onChange={setPassword} type="password"
            autoComplete="new-password" hint="They are signed out everywhere." />
          <button type="submit" disabled={password.length < PASSWORD_MIN}>Set it</button>
        </form>
      )}
    </li>
  );
}

function NewAccount({ onCreate }: { onCreate: (name: string, password: string, role: Role) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onCreate(name, password, role)) {
      setName("");
      setPassword("");
      setRole("viewer");
    }
  };

  return (
    <form className="account-form account-new" onSubmit={submit}>
      <h3>Add an account</h3>
      <Field label="Name" value={name} onChange={setName} autoComplete="off" />
      <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN} characters. Give it to them; they can change it once signed in.`} />
      <label className="account-field">
        Role
        <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {ROLES.map((option) => <option key={option.id} value={option.id}>{option.name}: {option.does}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!name || password.length < PASSWORD_MIN}>Add it</button>
    </form>
  );
}

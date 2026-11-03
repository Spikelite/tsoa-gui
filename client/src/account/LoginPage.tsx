import { useState, type FormEvent } from "react";

import { createFirst, Refused, signIn } from "./api";
import { AccountFrame, Field, Problem } from "./parts";
import { nextAddress, PASSWORD_MIN, useSession, waitingWords } from "./session";

// Signing in, at /login. On a new install with no account yet it makes the
// first one instead, which needs the setup code the server wrote on the
// device. Nothing on the readings' pages links here, so a kiosk never
// invites anyone to sign in.
export function LoginPage({ go = (address: string) => window.location.assign(address) }: {
  go?: (address: string) => void;
}) {
  const { session, unreachable } = useSession();
  const next = nextAddress(window.location.search);

  if (session === null) {
    return <AccountFrame title="Sign in"><p className="account-note">{waitingWords(unreachable)}</p></AccountFrame>;
  }
  if (session.account !== null) {
    return (
      <AccountFrame title="Sign in">
        <p className="account-note">
          You are signed in as {session.account.name}. <a href={next}>Carry on</a> or see <a href="/account">your account</a>.
        </p>
      </AccountFrame>
    );
  }
  return session.setup_needed ? <FirstAccount onDone={() => go("/account")} /> : <SignIn onDone={() => go(next)} />;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await signIn(name, password);
      onDone();
    } catch (error) {
      setProblem(error instanceof Refused ? error.message : String(error));
      setBusy(false);
    }
  };

  return (
    <AccountFrame title="Sign in">
      <form className="account-form" onSubmit={submit}>
        <Field label="Name" value={name} onChange={setName} autoComplete="username" autoFocus />
        <Field label="Password" value={password} onChange={setPassword} type="password"
          autoComplete="current-password" />
        <Problem text={problem} />
        <button type="submit" disabled={busy || !name || !password}>Sign in</button>
      </form>
      <p className="account-note">
        Anyone can see the readings without signing in. Signing in is for the controls and for managing accounts,
        which an admin makes.
      </p>
    </AccountFrame>
  );
}

function FirstAccount({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== again) {
      setProblem("The two passwords are not the same.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await createFirst(code, name, password);
      onDone();
    } catch (error) {
      setProblem(error instanceof Refused ? error.message : String(error));
      setBusy(false);
    }
  };

  return (
    <AccountFrame title="Make the first account">
      <p className="account-note">
        This server has no accounts yet. The first one is its admin, who makes the others. To show that you can
        reach the device, enter the setup code the server wrote there, in <code>/data/tsoa-gui/var/setup-code</code>.
      </p>
      <form className="account-form" onSubmit={submit}>
        <Field label="Setup code" value={code} onChange={setCode} autoComplete="off" autoFocus />
        <Field label="Name" value={name} onChange={setName} autoComplete="username" />
        <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters.`} />
        <Field label="Password again" value={again} onChange={setAgain} type="password" autoComplete="new-password" />
        <Problem text={problem} />
        <button type="submit" disabled={busy || !code || !name || password.length < PASSWORD_MIN || !again}>
          Make the account
        </button>
      </form>
    </AccountFrame>
  );
}

import { useId, type ReactNode } from "react";

import "./account.css";

/** A plain page of its own, the same whichever skin the readings are shown in. */
export function AccountFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="account">
      <header className="account-header">
        <a className="account-home" href="/">tsoa-gui</a>
      </header>
      <main className="account-main">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function Field({ label, value, onChange, type = "text", autoComplete, autoFocus, hint }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  autoComplete?: string;
  autoFocus?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete} autoFocus={autoFocus} spellCheck={false} autoCapitalize="off"
        aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && <span id={`${id}-hint`} className="account-hint">{hint}</span>}
    </div>
  );
}

export function Problem({ text }: { text: string | null }) {
  return text === null ? null : <p className="account-problem" role="alert">{text}</p>;
}

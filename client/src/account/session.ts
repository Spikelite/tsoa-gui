import { createContext, useContext, useEffect, useState } from "react";

import { getSession, type AccountInfo, type SessionState } from "./api";

export const PASSWORD_MIN = 8;

/** The signed-in account, for a skin to show; null when nobody is signed in, as on a kiosk. */
export const SignedInContext = createContext<AccountInfo | null>(null);

export const useSignedIn = () => useContext(SignedInContext);

/**
 * The session as the server has it, null until it answers. A server that
 * cannot be reached leaves it null and sets unreachable, which the readings'
 * pages treat as nobody signed in.
 */
export function useSession(): { session: SessionState | null; unreachable: boolean } {
  const [session, setSession] = useState<SessionState | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    let current = true;
    getSession().then(
      (answer) => current && setSession(answer),
      () => current && setUnreachable(true),
    );
    return () => {
      current = false;
    };
  }, []);
  return { session, unreachable };
}

/** What a page says while it has no session to show. */
export const waitingWords = (unreachable: boolean) =>
  unreachable ? "The server cannot be reached. Try again in a moment." : "Asking the server.";

/** Where to go once signed in: the page that sent someone here, if it is one of this server's. */
export function nextAddress(search: string): string {
  const next = new URLSearchParams(search).get("next");
  // "//host" and "/\host" would leave for another site.
  return next !== null && /^\/(?![/\\])/.test(next) ? next : "/";
}

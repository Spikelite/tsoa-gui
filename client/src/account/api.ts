// The server's sign-in and account routes. Every change carries the
// session's CSRF token, which the server hands out with the session.

export type Role = "viewer" | "operator" | "admin";

export const ROLES: { id: Role; name: string; does: string }[] = [
  { id: "viewer", name: "Viewer", does: "sees the readings" },
  { id: "operator", name: "Operator", does: "also uses the controls" },
  { id: "admin", name: "Admin", does: "also manages the accounts and settings" },
];

export interface AccountInfo {
  name: string;
  role: Role;
}

export interface SessionState {
  account: AccountInfo | null;
  setup_needed: boolean;
  csrf: string | null;
}

/** A request the server refused, with the reason it gave. */
export class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, csrf: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (csrf !== null) {
    headers["X-CSRF-Token"] = csrf;
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new Refused(0, "The server cannot be reached.");
  }
  if (!response.ok) {
    throw new Refused(response.status, await reason(response));
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

async function reason(response: Response): Promise<string> {
  if (response.status === 429) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
  } catch {
    // Not one of the server's own answers.
  }
  return `The server refused this (${response.status}).`;
}

export const getSession = () => call<SessionState>("GET", "/session", null);

export const signIn = (name: string, password: string) =>
  call<SessionState>("POST", "/session", null, { name, password });

export const createFirst = (code: string, name: string, password: string) =>
  call<SessionState>("POST", "/setup", null, { code, name, password });

export const signOut = (csrf: string) => call<void>("DELETE", "/session", csrf);

export const changeOwnPassword = (csrf: string, current: string, password: string) =>
  call<void>("POST", "/session/password", csrf, { current, password });

export const listAccounts = (csrf: string) => call<AccountInfo[]>("GET", "/accounts", csrf);

export const createAccount = (csrf: string, name: string, password: string, role: Role) =>
  call<AccountInfo>("POST", "/accounts", csrf, { name, password, role });

export const changeAccount = (csrf: string, name: string, change: { role?: Role; password?: string }) =>
  call<AccountInfo>("PATCH", `/accounts/${encodeURIComponent(name)}`, csrf, change);

export const removeAccount = (csrf: string, name: string) =>
  call<void>("DELETE", `/accounts/${encodeURIComponent(name)}`, csrf);

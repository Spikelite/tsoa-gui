import { call } from "../account/api";

// The server's controls: what the device lets each one be set to, and the
// route every change goes through.

export interface ControlState {
  name: string;
  value: number;
  /** Whether the device lets it be changed now. */
  adjustable: boolean;
  /** The lowest and highest the device accepts, where it reports them. */
  low: number | null;
  high: number | null;
  /** The highest an admin lets it be set to, for a control that has one. */
  ceiling: number | null;
}

export interface ChangeResult {
  /** Confirmed once the device reported on the value again, unconfirmed if it had not within the wait. */
  outcome: "confirmed" | "unconfirmed" | "refused";
  new: number;
  /** What the device reported, which can differ from what was asked for. */
  reported: number | null;
}

export const getControls = (csrf: string) => call<ControlState[]>("GET", "/controls", csrf);

export const setControl = (csrf: string, name: string, value: number) =>
  call<ChangeResult>("POST", `/controls/${encodeURIComponent(name)}`, csrf, { value });

export const setCeiling = (csrf: string, name: string, value: number | null) =>
  call<ControlState>("PUT", `/controls/${encodeURIComponent(name)}/ceiling`, csrf, { value });

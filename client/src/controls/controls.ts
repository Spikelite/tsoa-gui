import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Role, SessionState } from "../account/api";
import type { Measured } from "../skins/readings";
import { getControls, setCeiling, setControl, type ChangeResult, type ControlState } from "./api";

// The controls a signed-in operator or admin can use, shared with every skin
// through a context. Nobody else, a kiosk included, ever asks for them.

const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };

// The values the device holds can change from its own panel too, so they are
// asked for again this often while someone who may change them is signed in.
export const REFRESH_MS = 5000;

// Breaker sizes to pick with one tap, every 5 A, of which those the limit may
// be set to are offered. Anything else is typed, to a tenth of an amp.
export const PRESETS_A = [10, 15, 20, 25, 30, 35, 40, 45, 50];
export const STEP_A = 0.1;

/** The highest the signed-in account may set a limit to now. */
export function highest(state: ControlState, admin: boolean): number {
  // Until an admin sets the breaker size, only an admin may raise the limit.
  const top = state.ceiling ?? (admin ? state.high : state.value) ?? state.value;
  return state.high === null ? top : Math.min(top, state.high);
}

export interface Controls {
  states: ControlState[];
  admin: boolean;
  set: (name: string, value: number) => Promise<ChangeResult>;
  setCeiling: (name: string, value: number | null) => Promise<ControlState>;
}

export const ControlsContext = createContext<Controls | null>(null);

/** How a skin with a screen for changing a setting opens it; without one, the setting opens its panel under its row. */
export const OpenControlContext = createContext<((reading: Measured) => void) | null>(null);

/** The control called name, if the signed-in account may use it and the device has it. */
export function useControl(name: string | undefined): { state: ControlState; controls: Controls } | null {
  const controls = useContext(ControlsContext);
  const state = name === undefined ? undefined : controls?.states.find((control) => control.name === name);
  return controls === null || state === undefined ? null : { state, controls };
}

export const useControls = () => useContext(ControlsContext);

export function useControlsFor(session: SessionState | null): Controls | null {
  const csrf = session?.csrf ?? null;
  const role = session?.account?.role ?? "viewer";
  const allowed = csrf !== null && RANK[role] >= RANK.operator;
  const [states, setStates] = useState<ControlState[]>([]);
  const [asked, setAsked] = useState(0);
  const refresh = useCallback(() => setAsked((count) => count + 1), []);

  useEffect(() => {
    if (!allowed) {
      return;
    }
    let current = true;
    getControls(csrf).then(
      (answer) => current && setStates(answer),
      () => {
        // Kept as they were; the next refresh tries again.
      },
    );
    const timer = window.setTimeout(refresh, REFRESH_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [allowed, csrf, asked, refresh]);

  const set = useCallback(async (name: string, value: number) => {
    try {
      return await setControl(csrf ?? "", name, value);
    } finally {
      refresh();
    }
  }, [csrf, refresh]);

  const ceiling = useCallback(async (name: string, value: number | null) => {
    try {
      return await setCeiling(csrf ?? "", name, value);
    } finally {
      refresh();
    }
  }, [csrf, refresh]);

  const admin = role === "admin";
  return useMemo(() => (allowed ? { states, admin, set, setCeiling: ceiling } : null),
    [allowed, states, admin, set, ceiling]);
}

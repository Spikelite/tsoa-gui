import { useCallback, useState } from "react";

import { Refused } from "../account/api";
import * as f from "../skins/format";
import { STEP_A, type Controls } from "./controls";

export type ChangeStatus =
  | { kind: "idle" }
  | { kind: "pending"; value: number }
  | { kind: "done"; text: string; tone: "good" | "unsure" | "failed" };

// Divided rather than multiplied by a step, so that 0.3 is 0.3 and not a hair above it.
export const tenths = (value: number) => Math.round(value / STEP_A) / Math.round(1 / STEP_A);

/**
 * Sending a limit to the device and saying what became of it, which can be
 * other than what was asked for. `set` answers with the value the device now
 * has, as far as it is known.
 */
export function useLimitChange(name: string, controls: Controls) {
  const [status, setStatus] = useState<ChangeStatus>({ kind: "idle" });
  const clear = useCallback(() => setStatus({ kind: "idle" }), []);

  const set = useCallback(async (value: number): Promise<number | null> => {
    setStatus({ kind: "pending", value });
    try {
      const result = await controls.set(name, value);
      if (result.outcome === "unconfirmed") {
        setStatus({ kind: "done", tone: "unsure", text: `Sent ${f.amps(value)}. The device has not confirmed it yet.` });
        return null;
      }
      if (result.reported !== null && Math.abs(result.reported - value) >= STEP_A / 2) {
        setStatus({ kind: "done", tone: "good", text: `The device set ${f.amps(result.reported)} rather than ${f.amps(value)}.` });
        return result.reported;
      }
      setStatus({ kind: "done", tone: "good", text: `Set to ${f.amps(value)}.` });
      return value;
    } catch (error) {
      setStatus({ kind: "done", tone: "failed", text: error instanceof Refused ? error.message : "Not changed." });
      return null;
    }
  }, [controls, name]);

  return { status, set, clear };
}

import { useId, useState, type FormEvent } from "react";

import { Refused } from "../account/api";
import * as f from "../skins/format";
import type { ControlState } from "./api";
import { highest, PRESETS_A, STEP_A, type Controls } from "./controls";

type Status =
  | { kind: "idle" }
  | { kind: "pending"; value: number }
  | { kind: "done"; text: string; failed?: boolean };

const amps = f.amps;
// Divided rather than multiplied by a step, so that 0.3 is 0.3 and not a hair above it.
const tenths = (value: number) => Math.round(value / STEP_A) / Math.round(1 / STEP_A);

// A current limit's panel: the presets and a finer setting, the change shown
// as pending until the device reports on it, and for an admin the breaker
// size it may not go above.
export function LimitPanel(props: { label: string; state: ControlState; controls: Controls; onClose: () => void }) {
  const { state, controls } = props;
  const heading = useId();
  const low = state.low ?? 0;
  const top = highest(state, controls.admin);
  const [typed, setTyped] = useState(String(state.value));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const pending = status.kind === "pending";

  async function set(value: number) {
    setStatus({ kind: "pending", value });
    try {
      const result = await controls.set(state.name, value);
      if (result.outcome === "unconfirmed") {
        setStatus({ kind: "done", text: `Sent ${amps(value)}. The device has not confirmed it yet.` });
      } else if (result.reported !== null && Math.abs(result.reported - value) >= STEP_A / 2) {
        setStatus({ kind: "done", text: `The device set ${amps(result.reported)} rather than ${amps(value)}.` });
      } else {
        setStatus({ kind: "done", text: `Set to ${amps(value)}.` });
      }
    } catch (error) {
      setStatus({ kind: "done", text: error instanceof Refused ? error.message : "Not changed.", failed: true });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(typed);
    if (typed.trim() === "" || !Number.isFinite(value)) {
      setStatus({ kind: "done", text: "Type a number of amps.", failed: true });
      return;
    }
    void set(tenths(value));
  }

  return (
    <section className="control-panel" role="group" aria-labelledby={heading}>
      <h4 id={heading}>{props.label}</h4>
      {!state.adjustable ? (
        <p>The device does not allow this to be changed now, as when a remote panel sets it.</p>
      ) : (
        <>
          <div className="control-presets" role="group" aria-label="Breaker sizes">
            {PRESETS_A.filter((preset) => preset >= low && preset <= top).map((preset) => (
              <button key={preset} type="button" disabled={pending} aria-pressed={preset === state.value}
                onClick={() => void set(preset)}>
                {preset} A
              </button>
            ))}
          </div>
          <form className="control-form" onSubmit={submit}>
            <label>
              Amps
              <input type="number" inputMode="decimal" step={STEP_A} min={low} max={top} value={typed}
                disabled={pending} onChange={(event) => setTyped(event.target.value)} />
            </label>
            <button type="submit" disabled={pending}>Set</button>
          </form>
          {state.ceiling === null && !controls.admin && (
            <p className="control-note">Until an admin sets the breaker size, the limit can only be lowered.</p>
          )}
        </>
      )}
      <p className={`control-status${status.kind === "done" && status.failed ? " control-failed" : ""}`}
        role="status">
        {status.kind === "pending" ? `Setting ${amps(status.value)}.` : status.kind === "done" ? status.text : ""}
      </p>
      {controls.admin && <CeilingForm state={state} controls={controls} />}
      <button type="button" className="control-close" onClick={props.onClose}>Close</button>
    </section>
  );
}

function CeilingForm({ state, controls }: { state: ControlState; controls: Controls }) {
  const [typed, setTyped] = useState(state.ceiling === null ? "" : String(state.ceiling));
  const [words, setWords] = useState("");

  async function save(value: number | null) {
    try {
      const saved = await controls.setCeiling(state.name, value);
      setWords(saved.ceiling === null ? "No breaker size set." : `Breaker size ${amps(saved.ceiling)}.`);
    } catch (error) {
      setWords(error instanceof Refused ? error.message : "Not saved.");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(typed);
    if (typed.trim() === "" || !Number.isFinite(value) || value <= 0) {
      setWords("Type the breaker's size in amps.");
      return;
    }
    void save(tenths(value));
  }

  return (
    <form className="control-form control-ceiling" onSubmit={submit}>
      <label>
        Breaker size
        <input type="number" inputMode="decimal" step={STEP_A} min={0} max={state.high ?? undefined}
          value={typed} onChange={(event) => setTyped(event.target.value)} />
      </label>
      <button type="submit">Save</button>
      {state.ceiling !== null && <button type="button" onClick={() => void save(null)}>Remove</button>}
      <p className="control-note" role="status">
        {words || "Nobody can set the limit above the breaker's size."}
      </p>
    </form>
  );
}

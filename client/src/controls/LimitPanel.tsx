import { useId, useState, type FormEvent } from "react";

import { Refused } from "../account/api";
import * as f from "../skins/format";
import type { ControlState } from "./api";
import { tenths, useLimitChange } from "./change";
import { highest, PRESETS_A, STEP_A, type Controls } from "./controls";

const amps = f.amps;

// A current limit's panel: the presets, which fill in the setting without
// sending it, and a finer setting, the change shown as pending until the
// device reports on it, and for an admin the breaker size it may not go above.
export function LimitPanel(props: { label: string; state: ControlState; controls: Controls; onClose: () => void }) {
  const { state, controls } = props;
  const heading = useId();
  const low = state.low ?? 0;
  const top = highest(state, controls.admin);
  const [typed, setTyped] = useState(String(state.value));
  const { status, set, clear } = useLimitChange(state.name, controls);
  const [typo, setTypo] = useState(false);
  const pending = status.kind === "pending";

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(typed);
    const unreadable = typed.trim() === "" || !Number.isFinite(value);
    setTypo(unreadable);
    if (!unreadable) {
      void set(tenths(value));
    }
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
              <button key={preset} type="button" disabled={pending} aria-pressed={String(preset) === typed}
                onClick={() => {
                  setTyped(String(preset));
                  setTypo(false);
                  clear();
                }}>
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
      <p className={`control-status${typo || (status.kind === "done" && status.tone === "failed") ? " control-failed" : ""}`}
        role="status">
        {typo ? "Type a number of amps." : status.kind === "pending" ? `Setting ${amps(status.value)}.`
          : status.kind === "done" ? status.text : ""}
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

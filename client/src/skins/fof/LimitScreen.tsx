import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Refused } from "../../account/api";
import type { ControlState } from "../../controls/api";
import { tenths, useLimitChange } from "../../controls/change";
import { highest, PRESETS_A, useControl, type Controls } from "../../controls/controls";
import type { System } from "../../model/system";
import { inputOfLimit } from "../details";
import * as f from "../format";
import type { Link } from "../link";
import { inputName, type Measured } from "../readings";
import { Frame } from "./Frame";

const NUDGES = [["-1", -1], ["-0.1", -0.1], ["+0.1", 0.1], ["+1", 1]] as const;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "Del"];

/** The most a current is drawn on any phase of an input, if it is the input in use. */
function drawing(model: System, input: 1 | 2): number | null {
  const inverter = model.inverter_charger;
  if (inverter === null || ((inverter.ac_inputs ?? 1) >= 2 && inverter.active_input !== input)) {
    return null;
  }
  const currents = inverter.input_phases.flatMap((phase) => (phase.current_a === null ? [] : [phase.current_a]));
  return currents.length > 0 ? Math.max(...currents) : null;
}

/** What is typed so far with one more key, to a tenth and three figures. */
function typedWith(typed: string, key: string): string {
  if (key === "Del") {
    return typed.slice(0, -1);
  }
  if (key === ".") {
    return typed.includes(".") ? typed : `${typed || "0"}.`;
  }
  const [whole = "", part] = typed.split(".");
  return (part === undefined ? whole.length < 3 : part.length < 1) ? typed + key : typed;
}

// Changing a limit is a job of its own, so it takes over the frame: the
// sidebar becomes what the job needs, and the frame's inside holds the
// readout, the presets, the keys and a deliberate Set. Nothing reaches the
// device until Set, and the device's answer, which can differ from what was
// asked for, is what the screen then shows.
export function LimitScreen({ model, link, reading, onClose }: {
  model: System;
  link: Link;
  reading: Measured;
  onClose: () => void;
}) {
  const control = useControl(reading.control);
  const gone = control === null;
  // Signing out, or the device no longer offering it, ends the job.
  useEffect(() => {
    if (gone) {
      onClose();
    }
  }, [gone, onClose]);
  return control && <Job model={model} link={link} state={control.state} controls={control.controls} onClose={onClose} />;
}

function Job({ model, link, state, controls, onClose }: {
  model: System;
  link: Link;
  state: ControlState;
  controls: Controls;
  onClose: () => void;
}) {
  const input = inputOfLimit(state.name);
  const root = useRef<HTMLDivElement>(null);
  const { status, set, clear } = useLimitChange(state.name, controls);
  const [mode, setMode] = useState<"limit" | "breaker">("limit");
  const [staged, setStaged] = useState(state.value);
  const [typed, setTyped] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ text: string; failed: boolean } | null>(null);

  // Keys work from the moment the screen opens, and focus goes back after.
  useEffect(() => {
    const before = document.activeElement;
    root.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) {
        before.focus();
      }
    };
  }, []);

  const breaker = mode === "breaker";
  const current = breaker ? state.ceiling : state.value;
  const top = breaker ? (state.high ?? Infinity) : highest(state, controls.admin);
  const pending = status.kind === "pending";
  const locked = !breaker && !state.adjustable;
  const frozen = pending || locked;
  const invalid = !(staged > 0) || staged > top;
  const unchanged = staged === current;

  const stage = (value: number, text: string | null = null) => {
    setStaged(tenths(Math.max(0, value)));
    setTyped(text);
    setSaved(null);
    clear();
  };
  const press = (key: string) => {
    const next = typedWith(typed ?? "", key);
    stage(Number.parseFloat(next) || 0, next);
  };
  const switchTo = (next: "limit" | "breaker") => {
    setMode(next);
    stage(next === "breaker" ? (state.ceiling ?? 30) : state.value);
  };

  async function saveBreaker(value: number | null) {
    try {
      const after = await controls.setCeiling(state.name, value);
      setMode("limit");
      setStaged(state.value);
      setTyped(null);
      setSaved({ text: after.ceiling === null ? "No breaker size set." : `Breaker size saved: ${f.amps(after.ceiling)}.`, failed: false });
    } catch (error) {
      setSaved({ text: error instanceof Refused ? error.message : "Not saved.", failed: true });
    }
  }

  async function go() {
    if (frozen || invalid || unchanged) {
      return;
    }
    if (breaker) {
      await saveBreaker(staged);
      return;
    }
    const now = await set(staged);
    if (now !== null) {
      setStaged(now);
      setTyped(null);
    }
  }

  function key(event: KeyboardEvent) {
    if (/^[0-9.]$/.test(event.key)) {
      press(event.key);
    } else if (event.key === "Backspace") {
      press("Del");
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const step = event.shiftKey ? 1 : 0.1;
      stage(staged + (event.key === "ArrowUp" ? step : -step));
    } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      void go();
    } else if (event.key === "Escape") {
      onClose();
    } else {
      return;
    }
    event.preventDefault();
  }

  const ceiling = state.ceiling;
  const [note, tone] = ((): [string, string] => {
    if (locked) {
      return ["The device does not allow this to be changed now, as when a remote panel sets it.", "unsure"];
    }
    if (status.kind === "pending") {
      return [`Sending ${f.amps(status.value)}. Waiting for the device.`, "busy"];
    }
    if (status.kind === "done") {
      return [status.text, status.tone];
    }
    if (saved !== null) {
      return [saved.text, saved.failed ? "failed" : "good"];
    }
    if (staged > top) {
      const why = breaker || (ceiling === null && controls.admin) ? `the device's ${f.amps(top)}`
        : ceiling !== null ? `the breaker size of ${f.amps(ceiling)}` : "the present limit";
      return [`That is above ${why}.`, "failed"];
    }
    if (breaker) {
      return ["Nobody can set the limit above the breaker's size.", ""];
    }
    if (ceiling === null) {
      return controls.admin
        ? ["No breaker size set. You can go up to the device's most, which is its relay rating.", "unsure"]
        : ["Until an admin sets the breaker size, the limit can only be lowered.", "unsure"];
    }
    return ["", ""];
  })();

  const goWords = pending ? "Sending" : locked ? "Locked" : unchanged && !breaker ? "No change"
    : `${breaker ? "Save" : "Set"} ${f.amps(staged)}`;
  const draw = drawing(model, input);
  const low = state.low ?? 0;
  const presets = PRESETS_A.filter((preset) => preset >= low && preset <= top);
  // The rail runs to the most that can be set, within reason: a relay rating far
  // above any breaker would squash everything that matters at its left end.
  const railTop = Math.min(Math.max(Number.isFinite(top) ? top : 60, 10), 60);
  const railEnd = breaker ? `Device most ${f.amps(state.high ?? 0)}`
    : ceiling !== null ? `Breaker ${f.amps(ceiling)}`
    : controls.admin ? `Device most ${f.amps(state.high ?? 0)}` : `Now ${f.amps(state.value)}`;

  const side = (
    <>
      <button type="button" className="fof-tone-sand" aria-pressed={!breaker} onClick={() => switchTo("limit")}>
        Limit<b>{f.amps(state.value)}</b>
      </button>
      {controls.admin ? (
        <button type="button" className="fof-tone-lavender" aria-pressed={breaker}
          onClick={() => switchTo(breaker ? "limit" : "breaker")}>
          Breaker<b>{ceiling === null ? "Not set" : f.amps(ceiling)}</b>
        </button>
      ) : (
        <div className="fof-tone-lavender">Breaker<b>{ceiling === null ? "Not set" : f.amps(ceiling)}</b></div>
      )}
      <div className="fof-tone-periwinkle">Now drawing<b>{draw === null ? "Not in use" : f.amps(draw)}</b></div>
      <div className="fof-tone-teal">Wired to<b className="fof-word">AC input {input}</b></div>
    </>
  );

  return (
    <>
      <Frame model={model} state={link}
        job={{ title: breaker ? "Breaker size" : `${inputName(input, model)} limit`, side, onCancel: onClose }} />
      <div className="fof-well">
        <div className="fof-limit-area">
          <div ref={root} className="fof-limit" tabIndex={-1} onKeyDown={key}>
            <div className="fof-limit-main">
              <div className="fof-limit-readout">
                <div className="fof-limit-now">
                  <span>Now</span>
                  <b>{current === null ? "None" : f.amps(current)}</b>
                </div>
                <span className="fof-limit-arrow" aria-hidden="true" />
                <div className={`fof-limit-new${unchanged ? " fof-limit-same" : ""}`}>
                  <span>{breaker ? "New size" : "New limit"}</span>
                  <b>{f.amps(staged)}</b>
                </div>
              </div>
              <div>
                <div className={`fof-limit-rail${pending ? " fof-limit-rail-pending" : ""}`} aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (staged / railTop) * 100)}%` }} />
                  {!breaker && draw !== null && <i style={{ left: `${Math.min(100, (draw / railTop) * 100)}%` }} />}
                </div>
                <div className="fof-limit-legend">
                  {!breaker && draw !== null ? <span>Drawing <b>{f.amps(draw)}</b> now</span> : <span />}
                  <span>{railEnd}</span>
                </div>
              </div>
              <div className={`fof-limit-note${tone ? ` fof-limit-note-${tone}` : ""}`} role="status">{note}</div>
              <div className="fof-limit-presets" role="group" aria-label="Breaker sizes">
                {presets.map((preset) => (
                  <button key={preset} type="button" className="fof-key fof-key-pill" aria-pressed={preset === staged}
                    disabled={frozen} onClick={() => stage(preset)}>
                    {preset} A
                  </button>
                ))}
              </div>
              {breaker && ceiling !== null && (
                <button type="button" className="fof-key fof-key-pill fof-tone-lavender fof-limit-remove"
                  onClick={() => void saveBreaker(null)}>
                  Remove
                </button>
              )}
            </div>
            <div className="fof-limit-pad">
              <div className="fof-limit-nudges">
                {NUDGES.map(([words, amount]) => (
                  <button key={words} type="button" className="fof-key fof-tone-lavender" aria-label={`${words} amps`}
                    disabled={frozen} onClick={() => stage(staged + amount)}>
                    {words}
                  </button>
                ))}
              </div>
              <div className="fof-limit-keys">
                {KEYS.map((name) => (
                  <button key={name} type="button" disabled={frozen} onClick={() => press(name)}
                    className={`fof-key fof-limit-key ${name === "." || name === "Del" ? "fof-tone-lavender" : "fof-tone-periwinkle"}`}>
                    {name}
                  </button>
                ))}
              </div>
              <button type="button" className={`fof-key fof-limit-go${pending ? " fof-key-waiting" : ""}`}
                disabled={frozen || invalid || unchanged} onClick={() => void go()}>
                {goWords}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

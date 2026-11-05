import { useContext, useId, type CSSProperties, type ReactNode } from "react";

import { OpenControlContext } from "../../controls/controls";
import type { AlarmCheck, PartName, Status } from "../../model/system";
import { alarmingFirst, type DetailGroup } from "../details";
import { Eased } from "../Eased";
import { keysFor } from "../keys";
import type { Measured } from "../readings";
import { Rows } from "./Core";
import { CHECKS, clearWords, CONTROLS, sectionTone } from "./sections";
import { SectionContext } from "./smallPanel";
import { StatusWords } from "./StatusPill";

const CHECK_STATUS = { ok: "good", warning: "warning", alarm: "fault" } as const;

export const SectionHead = ({ title, tone }: { title: ReactNode; tone: string }) => (
  <h3 className={`fof-deck-tag fof-tone-${tone}`}>
    <span>{title}</span>
    <i aria-hidden="true" />
  </h3>
);

/** A setting the account may change, as a key big enough to press. */
function ControlKey({ reading }: { reading: Measured }) {
  const open = useContext(OpenControlContext);
  return (
    <button type="button" className="fof-key fof-tone-sand fof-deck-control" title={`Change the ${reading.label}`}
      onClick={() => open?.(reading)}>
      <span>{reading.label}</span>
      <b><Eased value={reading.value} format={reading.format} /></b>
    </button>
  );
}

// What a part watches. A list of every condition reads as that many alarms, so
// only what is raised takes color, and the rest fold away behind one bar.
function Checks({ checks, open }: { checks: AlarmCheck[]; open: boolean }) {
  const raised = checks.filter((check) => check.level !== "ok");
  const clear = checks.filter((check) => check.level === "ok");
  return (
    <section className="fof-deck-group fof-deck-checks" aria-label="Alarms">
      {raised.length > 0 && (
        <ul className="fof-deck-raised">
          {raised.map((check) => (
            <li key={check.name} className={`status-${CHECK_STATUS[check.level]}`}>
              {check.name}
              <StatusWords status={CHECK_STATUS[check.level]} separator />
            </li>
          ))}
        </ul>
      )}
      {clear.length > 0 && (
        <details className="fof-deck-clear" open={open}>
          <summary>
            <span className="fof-deck-clear-words">{clearWords(clear.length, raised.length > 0)}</span>
            <span className="fof-deck-clear-fill" aria-hidden="true" />
            <span className="fof-deck-clear-show">Show them</span>
            <span className="fof-deck-clear-hide">Hide them</span>
          </summary>
          <ul>
            {clear.map((check) => <li key={check.name}>{check.name}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

// A part's own page, as the console would show one system in full: the part
// drawn large, then every reading in sections flowing down a fixed grid of
// columns, and what the part watches. Its name, state and figures are on the
// frame's top bar, or on a phone, where that has no room, in a row at the top.
export function Deck(props: {
  part: PartName;
  title: string;
  status: Status;
  state: string;
  className?: string;
  /** Beside the name and state, at the far end of their row. */
  aside?: ReactNode;
  groups: DetailGroup[];
  checks: AlarmCheck[];
  /** The part drawn large, between its name and its readings. */
  children?: ReactNode;
  /** What the account may change here, as keys ahead of the part's readings. */
  controls?: Measured[];
  /** Where a page shows one section at a time, the section the drawing goes with; with none, it is left out. */
  drawnWith?: string;
}) {
  const heading = useId();
  const offline = props.status === "offline";
  const checks = alarmingFirst(props.checks);
  const only = useContext(SectionContext);
  const shows = (title: string) => only === null || only === title;
  const groups = props.groups.filter((group) => shows(group.title));
  const controls = shows(CONTROLS) ? props.controls : undefined;
  const keys = keysFor(groups.map((group) => group.title));
  const look = only === null ? props.className : "fof-deck-one";
  return (
    <section className={`fof-deck status-${props.status}${look ? ` ${look}` : ""}`}
      data-part={props.part} aria-labelledby={heading}>
      <div className="fof-deck-head">
        <h2 className="fof-label-block">
          <span id={heading}>{props.title}</span>
          <StatusWords status={props.status} separator />
        </h2>
        <p className="fof-state-line">{offline ? "Not reporting" : props.state}</p>
        {!offline && props.aside}
      </div>

      {!offline && only !== null && only === props.drawnWith && groups.length === 0 && (
        <SectionHead title={only} tone={sectionTone(only)} />
      )}
      {!offline && (only === null || only === props.drawnWith) && props.children}

      {!offline && (groups.length > 0 || controls) && (
        <div className="fof-deck-groups" style={{ "--groups": groups.length + (controls ? 1 : 0) } as CSSProperties}>
          {controls && (
            <section className="fof-deck-group" aria-label={CONTROLS}>
              <SectionHead title={CONTROLS} tone="sand" />
              <div className="fof-deck-controls">
                {controls.map((reading) => <ControlKey key={reading.label} reading={reading} />)}
              </div>
            </section>
          )}
          {groups.map((group, index) => (
            <section key={keys[index]} className="fof-deck-group" aria-label={group.title}>
              <SectionHead title={group.title} tone={sectionTone(group.title)} />
              <dl className="fof-rows">
                <Rows readings={group.readings} />
              </dl>
            </section>
          ))}
        </div>
      )}

      {!offline && checks.length > 0 && shows(CHECKS) && <Checks checks={checks} open={only !== null} />}
    </section>
  );
}

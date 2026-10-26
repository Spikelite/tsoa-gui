import { useId, type ReactNode } from "react";

import type { AlarmCheck, PartName, Status } from "../../model/system";
import { alarmingFirst, type DetailGroup } from "../details";
import { keysFor } from "../keys";
import { closePart } from "../partView";
import { StatusIcon } from "../StatusIcon";
import { ReadingList } from "./Panels";

const CHECK_STATUS = { ok: "good", warning: "warning", alarm: "fault" } as const;
const CHECK_WORDS = { ok: "OK", warning: "Warning", alarm: "Alarm" };

// A part's own page: its name and state, anything drawn for the part alone,
// every reading in groups, and every condition it watches.
export function PartPage(props: {
  part: PartName;
  title: string;
  status: Status;
  state: string;
  groups: DetailGroup[];
  checks: AlarmCheck[];
  children?: ReactNode;
}) {
  const heading = useId();
  const offline = props.status === "offline";
  const checks = alarmingFirst(props.checks);
  const keys = keysFor(props.groups.map((group) => group.title));
  return (
    <section className={`page status-${props.status}`} data-part={props.part} aria-labelledby={heading}>
      <header className="page-header">
        <button type="button" className="page-back" onClick={closePart}>Overview</button>
        <h2 id={heading}>{props.title}</h2>
        <p className="panel-state">
          <StatusIcon status={props.status} />
          <span>{offline ? "Not reporting" : props.state}</span>
        </p>
      </header>
      {!offline && (
        <>
          {props.children}
          <div className="page-groups">
            {props.groups.map((group, index) => (
              <section key={keys[index]} className="page-group">
                <h3>{group.title}</h3>
                <ReadingList readings={group.readings} />
              </section>
            ))}
            {checks.length > 0 && (
              <section className="page-group">
                <h3>Alarms</h3>
                <ul className="checks">
                  {checks.map((check) => (
                    <li key={check.name}>
                      <StatusIcon status={CHECK_STATUS[check.level]} />
                      <span>{check.name}</span>
                      <span className="check-level">{CHECK_WORDS[check.level]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}

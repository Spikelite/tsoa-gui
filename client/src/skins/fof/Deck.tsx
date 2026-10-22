import { useId, type ReactNode } from "react";

import type { AlarmCheck, PartName, Status } from "../../model/system";
import { alarmingFirst, type DetailGroup } from "../details";
import { Rows } from "./Core";
import { NamePill, StatusWords } from "./StatusPill";

const CHECK_STATUS = { ok: "good", warning: "warning", alarm: "fault" } as const;

// A part's own page, as the console would show one system in full: its name
// and state, the part drawn large, then every reading in groups headed by
// rounded tags flowing down balanced columns, and every condition the part
// watches as a button in the color of where it stands.
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
}) {
  const heading = useId();
  const offline = props.status === "offline";
  const checks = alarmingFirst(props.checks);
  return (
    <section className={`fof-deck status-${props.status}${props.className ? ` ${props.className}` : ""}`}
      data-part={props.part} aria-labelledby={heading}>
      <div className="fof-deck-head">
        <h2 className="fof-label-block">
          <span id={heading}>{props.title}</span>
          <StatusWords status={props.status} separator />
        </h2>
        <p className="fof-state-line">{offline ? "Not reporting" : props.state}</p>
        {!offline && props.aside}
      </div>

      {!offline && props.children}

      {!offline && (
        <div className="fof-deck-groups">
          {props.groups.map((group, index) => (
            <section key={group.title} className="fof-deck-group" aria-label={group.title}>
              <h3 className={`fof-deck-tag fof-deck-tag-${index % 3}`}>{group.title}</h3>
              <dl className="fof-rows">
                <Rows readings={group.readings} />
              </dl>
            </section>
          ))}
          {checks.length > 0 && (
            <section className="fof-deck-group fof-deck-checks" aria-label="Alarms">
              <h3 className="fof-deck-tag fof-deck-tag-alarms">Alarms</h3>
              <ul>
                {checks.map((check) => (
                  <li key={check.name}>
                    <NamePill name={check.name} status={CHECK_STATUS[check.level]} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

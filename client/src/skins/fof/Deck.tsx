import { useId, type CSSProperties, type ReactNode } from "react";

import type { AlarmCheck, PartName, Status } from "../../model/system";
import { alarmingFirst, type DetailGroup } from "../details";
import { keysFor } from "../keys";
import { Rows } from "./Core";
import { StatusWords } from "./StatusPill";

const CHECK_STATUS = { ok: "good", warning: "warning", alarm: "fault" } as const;

/** A section's color says what it holds, whatever else is on the page. Any other is the part's own, in sand. */
const SECTION_TONES: Partial<Record<string, string>> = { History: "lavender", Energy: "lavender", Device: "teal" };

const SectionHead = ({ title, tone }: { title: string; tone: string }) => (
  <h3 className={`fof-deck-tag fof-tone-${tone}`}>
    <span>{title}</span>
    <i aria-hidden="true" />
  </h3>
);

/** The bar over the checks that are clear, which says all of them are if nothing is raised. */
function clearWords(count: number, anyRaised: boolean): string {
  if (anyRaised) {
    return `${count} more clear`;
  }
  return count === 1 ? "1 check clear" : `All ${count} checks clear`;
}

// What a part watches. A list of every condition reads as that many alarms, so
// only what is raised takes color, and the rest fold away behind one bar.
function Checks({ checks }: { checks: AlarmCheck[] }) {
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
        <details className="fof-deck-clear">
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
}) {
  const heading = useId();
  const offline = props.status === "offline";
  const checks = alarmingFirst(props.checks);
  const keys = keysFor(props.groups.map((group) => group.title));
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
        <div className="fof-deck-groups" style={{ "--groups": props.groups.length } as CSSProperties}>
          {props.groups.map((group, index) => (
            <section key={keys[index]} className="fof-deck-group" aria-label={group.title}>
              <SectionHead title={group.title} tone={SECTION_TONES[group.title] ?? "sand"} />
              <dl className="fof-rows">
                <Rows readings={group.readings} />
              </dl>
            </section>
          ))}
          {checks.length > 0 && <Checks checks={checks} />}
        </div>
      )}
    </section>
  );
}

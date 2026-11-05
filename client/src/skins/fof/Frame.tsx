import type { MouseEvent } from "react";

import { useSignedIn } from "../../account/session";
import { Clock } from "../../Clock";
import type { PartName, Status, System } from "../../model/system";
import { batteryState, partTitle } from "../describe";
import { alarmingFirst } from "../details";
import { Eased } from "../Eased";
import * as f from "../format";
import { LINK_SENTENCES, LINK_WORDS, type Link } from "../link";
import { closePart, openPart, partAddress } from "../partView";
import { STATUS_LABELS } from "../status";
import { SkinSegment } from "./SkinSegment";

/** The sidebar, in the order power runs through the system. */
const SIDEBAR: PartName[] = ["grid", "generator", "solar", "inverter_charger", "battery", "ac_loads", "dc_loads"];

type Vital = {
  kind: "battery" | "solar" | "loads"; value: number; format: f.Format; label: string;
  /** The first to go where the bar is short of room. */
  spare?: boolean;
};

/** The figures that say how the system is doing, for the top bar. */
function vitals({ battery, solar, ac_loads: ac, dc_loads: dc }: System): Vital[] {
  const loads = [ac?.power_w, dc?.power_w].filter((power) => power !== null && power !== undefined);
  return [
    ...(battery?.soc_percent != null
      ? [{ kind: "battery", value: battery.soc_percent, format: f.percent, label: `Battery, ${batteryState(battery)}` } as const]
      : []),
    ...(battery?.power_w != null
      ? [{
          kind: "battery", value: Math.abs(battery.power_w), format: f.power, spare: true,
          label: battery.power_w < 0 ? "Out of the battery" : "Into the battery",
        } as const]
      : []),
    ...(solar?.power_w != null ? [{ kind: "solar", value: solar.power_w, format: f.power, label: "Solar" } as const] : []),
    ...(loads.length > 0
      ? [{ kind: "loads", value: loads.reduce((sum, power) => sum + power, 0), format: f.power, label: "Loads" } as const]
      : []),
  ];
}

/** The statuses that take over the top bar, the worst highest. */
const URGENCY: Partial<Record<Status, number>> = { attention: 1, warning: 2, fault: 3 };

type Raised = { part: PartName; status: Status; word: string };

/** Each part that needs attention or is not reporting, with its word for why: its worst alarm, or else its status. */
function raised(model: System): Raised[] {
  return SIDEBAR.flatMap((part) => {
    const shown = model[part];
    if (shown === null || (shown.status !== "offline" && URGENCY[shown.status] === undefined)) {
      return [];
    }
    const alarms = "alarms" in shown ? shown.alarms : [];
    const checks = "checks" in shown ? alarmingFirst(shown.checks).filter((check) => check.level !== "ok") : [];
    const worst = alarms.find((alarm) => alarm.level === "alarm") ?? alarms[0] ?? checks[0];
    return [{ part, status: shown.status, word: worst?.name ?? STATUS_LABELS[shown.status] }];
  });
}

type Alert = { status: Status; words: string; detail?: string };

/** Readings that are no longer live come first: they are why any other alarm cannot be trusted. */
const LINK_ALERTS: Record<Exclude<Link, "live">, Alert> = {
  stale: { status: "attention", words: LINK_WORDS.stale, detail: "Not hearing from the device, last readings shown" },
  lost: { status: "fault", words: LINK_WORDS.lost, detail: "Lost the server, last readings shown" },
  busy: { status: "attention", words: LINK_WORDS.busy, detail: "Too many screens open, last readings shown" },
};

/** What takes over the top bar, if anything does: the state of the link, or else the worst alarm. */
function alertFor(state: Link, parts: Raised[], model: System): Alert | null {
  if (state !== "live") {
    return LINK_ALERTS[state];
  }
  const urgent = parts.filter(({ status }) => URGENCY[status] !== undefined);
  const worst = urgent.sort((a, b) => URGENCY[b.status]! - URGENCY[a.status]!)[0];
  if (worst === undefined) {
    return null;
  }
  const label = STATUS_LABELS[worst.status];
  return {
    status: worst.status,
    words: `${partTitle(worst.part, model)} ${label}`,
    detail: worst.word === label ? undefined : worst.word,
  };
}

// The console's frame, which stays put on every screen while what is inside it
// changes: one elbow turning a sidebar into a thick top bar, and another
// turning it into a thin bottom bar. The top bar's segments say what the
// screen is, how the system is doing, the time and how current the readings
// are, and an alarm takes them over so that it reads from across a room. The
// sidebar is the way round the system, each block saying what its part has
// raised, and the elbow above it the way back to the whole of it. What a
// kiosk's viewer rarely needs goes along the bottom.
export function Frame({ model, part = null, state = "live" }: {
  /** With none yet, the frame stands empty, waiting for the first readings. */
  model: System | null;
  part?: PartName | null;
  state?: Link;
}) {
  const signedIn = useSignedIn();
  const parts = model ? raised(model) : [];
  const alert = model ? alertFor(state, parts, model) : null;
  const open = (event: MouseEvent<HTMLAnchorElement>, name: PartName) => {
    event.preventDefault();
    openPart(name, event.currentTarget);
  };
  return (
    <>
      {part === null ? (
        <div className="fof-elbow fof-elbow-top"><span>Overview</span></div>
      ) : (
        <button type="button" className="fof-elbow fof-elbow-top" onClick={closePart}><span>Overview</span></button>
      )}

      <div className="fof-top">
        <span className="fof-label" aria-hidden="true">Power systems</span>
        {alert ? (
          <span className={`fof-alert status-${alert.status}`} role="alert">
            <b>{alert.words}</b>
            {alert.detail && <small>{alert.detail}</small>}
          </span>
        ) : (
          <>
            {model && vitals(model).map(({ kind, value, format, label, spare }) => (
              <span key={label} className={`fof-vital fof-vital-${kind}${spare ? " fof-vital-spare" : ""}`}>
                <b><Eased value={value} format={format} /></b>
                <small>{label}</small>
              </span>
            ))}
            <span className="fof-bar" aria-hidden="true" />
          </>
        )}
        <span className="fof-segment fof-clock-segment">
          <Clock />
        </span>
        {model === null ? (
          <span className="fof-link fof-link-stale"><span aria-hidden="true">Waiting</span></span>
        ) : (
          // How current the readings are: one word on screen, the whole of it for a screen reader.
          <span className={`fof-link fof-link-${state}`} role="status">
            <span aria-hidden="true">{LINK_WORDS[state]}</span>
            <span className="fof-quiet">{LINK_SENTENCES[state]}</span>
          </span>
        )}
      </div>

      <nav className="fof-side" aria-label="Parts">
        {model === null && SIDEBAR.map((name) => <span key={name} data-side={name} />)}
        {model && SIDEBAR.filter((name) => model[name] !== null).map((name) => {
          const own = parts.find((entry) => entry.part === name);
          return (
            <a key={name} href={partAddress(name)} data-side={name} className={own && `fof-side-raised status-${own.status}`}
              aria-current={name === part ? "page" : undefined} onClick={(event) => open(event, name)}>
              {own && <em>{own.word}</em>}
              {partTitle(name, model)}
            </a>
          );
        })}
      </nav>

      {/* The frame carries the application's name, in place of the page header's. */}
      <h1 className="fof-elbow fof-elbow-foot"><span>tsoa-gui</span></h1>

      <div className="fof-bottom">
        <span className="fof-bar" aria-hidden="true" />
        {signedIn !== null && (
          <a className="fof-segment fof-account-segment" href="/account" title="Your account">{signedIn.name}</a>
        )}
        <SkinSegment />
      </div>
    </>
  );
}

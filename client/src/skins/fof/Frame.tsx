import type { MouseEvent, ReactNode } from "react";

import { useSignedIn } from "../../account/session";
import { Clock } from "../../Clock";
import type { PartName, Status, System } from "../../model/system";
import { batteryState, inverterState, MODES, partTitle } from "../describe";
import { alarmingFirst, partDetail } from "../details";
import { Eased } from "../Eased";
import * as f from "../format";
import { LINK_SENTENCES, LINK_WORDS, type Link } from "../link";
import { closePart, openPart, partAddress } from "../partView";
import { isWorded, timeLeftReadings } from "../readings";
import { STATUS_LABELS } from "../status";
import type { PageSections } from "./sections";
import { SkinSegment } from "./SkinSegment";
import { useSmallPanel } from "./smallPanel";

/** The sidebar, in the order power runs through the system. */
const SIDEBAR: PartName[] = ["grid", "generator", "solar", "inverter_charger", "battery", "ac_loads", "dc_loads"];

type Vital = {
  kind: "battery" | "solar" | "loads" | "part"; label: string;
  /** A figure, or else `text` for a value in words, which `withUnit` says ends in a unit to leave as it is. */
  value?: number; format?: f.Format; text?: string; withUnit?: boolean;
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

/** The figures for a part's own page, whose name the bar's title then gives. */
function partVitals(part: PartName, model: System): Vital[] {
  const { battery, inverter_charger: inverter } = model;
  // Its last figures are not what it is doing now.
  if (model[part]?.status === "offline") {
    return [];
  }
  if (part === "battery" && battery !== null) {
    const left = timeLeftReadings(battery)[0];
    return [
      ...(battery.soc_percent === null ? [] : [{ kind: "part", value: battery.soc_percent, format: f.percent, label: batteryState(battery) } as const]),
      ...(battery.power_w === null ? [] : [{
        kind: "part", value: Math.abs(battery.power_w), format: f.power,
        label: battery.power_w < 0 ? "Out of the battery" : "Into the battery",
      } as const]),
      ...(left !== undefined && isWorded(left) ? [{ kind: "part", text: left.text, withUnit: left.withUnit, label: left.label } as const] : []),
    ];
  }
  if (part === "inverter_charger" && inverter !== null) {
    return [
      ...(inverter.ac_out_power_w === null ? [] : [{ kind: "part", value: inverter.ac_out_power_w, format: f.power, label: "AC out" } as const]),
      { kind: "part", text: inverterState(inverter), label: "State" },
      ...(inverter.mode === null ? [] : [{ kind: "part", text: MODES[inverter.mode], label: "Mode" } as const]),
    ];
  }
  const detail = partDetail(part, model);
  return detail?.headline.value === null || detail === null ? [] : [
    { kind: "part", value: detail.headline.value, format: detail.headline.format, label: detail.state },
  ];
}

/** What a small panel shows on a part's block, in place of the readings it has no room for on the diagram. */
function sideFigure(part: PartName, model: System): { value: number | null; format: f.Format } {
  if (part === "battery") {
    return { value: model.battery?.soc_percent ?? null, format: f.percent };
  }
  if (part === "inverter_charger") {
    return { value: model.inverter_charger?.ac_out_power_w ?? null, format: f.power };
  }
  return partDetail(part, model)?.headline ?? { value: null, format: f.power };
}

// The console's frame, which stays put on every screen while what is inside it
// changes: one elbow turning a sidebar into a thick top bar, and another
// turning it into a thin bottom bar. The top bar's segments say what the
// screen is, how the system is doing, the time and how current the readings
// are, and an alarm takes them over so that it reads from across a room. The
// sidebar is the way round the system, each block saying what its part has
// raised, and the elbow above it the way back to the whole of it. On a small
// panel each block carries its part's figure too, and on a part's page the
// sidebar is the way round its sections. What a kiosk's viewer rarely needs
// goes along the bottom.
export function Frame({ model, part = null, state = "live", job, sections }: {
  /** With none yet, the frame stands empty, waiting for the first readings. */
  model: System | null;
  part?: PartName | null;
  state?: Link;
  /** A job that has taken over the frame: its title, the sidebar it needs, and the way out of it. */
  job?: { title: string; side: ReactNode; onCancel: () => void };
  /** On a screen that shows one section of a part's page at a time, those sections. */
  sections?: PageSections | null;
}) {
  const signedIn = useSignedIn();
  const small = useSmallPanel();
  const parts = model ? raised(model) : [];
  const alert = model ? alertFor(state, parts, model) : null;
  const open = (event: MouseEvent<HTMLAnchorElement>, name: PartName) => {
    event.preventDefault();
    openPart(name, event.currentTarget);
  };
  return (
    <>
      {job ? (
        <button type="button" className="fof-elbow fof-elbow-top" onClick={job.onCancel}><span>Cancel</span></button>
      ) : part === null ? (
        <div className="fof-elbow fof-elbow-top"><span>Overview</span></div>
      ) : (
        <button type="button" className="fof-elbow fof-elbow-top" onClick={closePart}><span>Overview</span></button>
      )}

      <div className="fof-top">
        <span className="fof-label" aria-hidden={job ? undefined : true}>
          {job?.title ?? (model && part ? partTitle(part, model) : "Power systems")}
        </span>
        {alert ? (
          <span className={`fof-alert status-${alert.status}`} role="alert">
            <b>{alert.words}</b>
            {alert.detail && <small>{alert.detail}</small>}
          </span>
        ) : (
          <>
            {model && !job && (part ? partVitals(part, model) : vitals(model)).map(({ kind, value, format, text, withUnit, label, spare }) => (
              <span key={label} data-side={kind === "part" ? part : undefined}
                className={`fof-vital fof-vital-${kind}${spare ? " fof-vital-spare" : ""}`}>
                <b className={text === undefined || withUnit ? undefined : "fof-word"}>
                  {text ?? <Eased value={value ?? null} format={format ?? f.power} />}
                </b>
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

      <nav className="fof-side" aria-label={job ? job.title : sections ? "Sections" : "Parts"}>
        {job?.side}
        {model === null && SIDEBAR.map((name) => <span key={name} data-side={name} />)}
        {!job && sections?.all.map(({ title, label, tone, raised: worst }) => (
          <button key={title} type="button" className={worst ? `fof-side-raised status-${worst}` : `fof-tone-${tone}`}
            aria-pressed={title === sections.shown} onClick={() => sections.choose(title)}>
            {label}
          </button>
        ))}
        {model && !job && !sections && SIDEBAR.filter((name) => model[name] !== null).map((name) => {
          const own = parts.find((entry) => entry.part === name);
          const figure = sideFigure(name, model);
          return (
            <a key={name} href={partAddress(name)} data-side={name} className={own && `fof-side-raised status-${own.status}`}
              aria-current={name === part ? "page" : undefined} onClick={(event) => open(event, name)}>
              {own ? <em>{own.word}</em> : small && <b><Eased value={figure.value} format={figure.format} /></b>}
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

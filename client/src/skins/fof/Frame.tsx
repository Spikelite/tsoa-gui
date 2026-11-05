import type { MouseEvent } from "react";

import { useSignedIn } from "../../account/session";
import { Clock } from "../../Clock";
import type { PartName, System } from "../../model/system";
import { batteryState, partTitle } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { LINK_SENTENCES, LINK_WORDS, type Link } from "../link";
import { closePart, openPart, partAddress } from "../partView";
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

// The console's frame, which stays put on every screen while what is inside it
// changes: one elbow turning a sidebar into a thick top bar, and another
// turning it into a thin bottom bar. The top bar's segments say what the
// screen is, how the system is doing, the time and how current the readings
// are. The sidebar is the way round the system, and the elbow above it the way
// back to the whole of it. What a kiosk's viewer rarely needs goes along the bottom.
export function Frame({ model, part, state }: { model: System; part: PartName | null; state: Link }) {
  const signedIn = useSignedIn();
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
        {vitals(model).map(({ kind, value, format, label, spare }) => (
          <span key={label} className={`fof-vital fof-vital-${kind}${spare ? " fof-vital-spare" : ""}`}>
            <b><Eased value={value} format={format} /></b>
            <small>{label}</small>
          </span>
        ))}
        <span className="fof-bar" aria-hidden="true" />
        <span className="fof-segment fof-clock-segment">
          <Clock />
        </span>
        {/* How current the readings are: one word on screen, the whole of it for a screen reader. */}
        <span className={`fof-link fof-link-${state}`} role="status">
          <span aria-hidden="true">{LINK_WORDS[state]}</span>
          <span className="fof-quiet">{LINK_SENTENCES[state]}</span>
        </span>
      </div>

      <nav className="fof-side" aria-label="Parts">
        {SIDEBAR.filter((name) => model[name] !== null).map((name) => (
          <a key={name} href={partAddress(name)} data-side={name} aria-current={name === part ? "page" : undefined}
            onClick={(event) => open(event, name)}>
            {partTitle(name, model)}
          </a>
        ))}
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

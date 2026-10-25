import { useId, type MouseEvent, type ReactNode } from "react";

import type {
  AcLoads, Alarm, Battery, DcLoads, Generator, Grid, InverterCharger, PartName, Solar, Status, System,
} from "../../model/system";
import { batteryState, generatorState, gridState, inverterState, partTitle, solarState } from "../describe";
import { DETAILED } from "../details";
import { Eased } from "../Eased";
import * as f from "../format";
import {
  acLoadsReadings, batteryReadings, dcLoadsReadings, dcLoadsState, generatorReadings, gridReadings,
  inverterReadings, isWorded, solarReadings, type Measured, type Reading, type Readings,
} from "../readings";
import { openPart, partAddress } from "../partView";
import { StatusIcon } from "../StatusIcon";

function Panel(props: { part: PartName; title: ReactNode; status: Status; state: string; children: ReactNode }) {
  const heading = useId();
  // A part with a page of its own opens it from anywhere on its panel; its
  // name is the link to it, for the keyboard and for a screen reader.
  const detailed = DETAILED.includes(props.part);
  const open = (event: MouseEvent) => {
    // A click on the name reaches the part's own handler too; open once.
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    openPart(props.part, event.currentTarget.closest("[data-part]"));
  };
  return (
    <section className={`panel status-${props.status}${detailed ? " panel-opens" : ""}`} data-part={props.part}
      aria-labelledby={heading} onClick={detailed ? open : undefined}>
      <header className="panel-header">
        <h2 id={heading}>
          {detailed ? <a href={partAddress(props.part)} onClick={open}>{props.title}</a> : props.title}
        </h2>
        <p className="panel-state">
          <StatusIcon status={props.status} />
          <span>{props.status === "offline" ? "Not reporting" : props.state}</span>
        </p>
      </header>
      {props.status === "offline" ? null : props.children}
    </section>
  );
}

/** The panel's main reading, drawn large. */
function Headline({ reading }: { reading: Measured }) {
  return (
    <p className="headline">
      <Eased value={reading.value} format={reading.format} />
    </p>
  );
}

function Details({ readings }: { readings: Readings }) {
  return readings.details.length === 0 ? null : <ReadingList readings={readings.details} />;
}

export function ReadingList({ readings }: { readings: Reading[] }) {
  return (
    <dl>
      {readings.map((reading) => {
        if (isWorded(reading)) {
          return (
            <div key={reading.label} className="reading">
              <dt>{reading.label}</dt>
              <dd>{reading.text}</dd>
            </div>
          );
        }
        if (reading.value === null && !reading.always) {
          return null;
        }
        return (
          <div key={reading.label} className="reading">
            <dt>{reading.label}</dt>
            <dd>
              <Eased value={reading.value} format={reading.format} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Alarms({ alarms }: { alarms: Alarm[] }) {
  if (alarms.length === 0) {
    return null;
  }
  return (
    <ul className="alarms">
      {alarms.map((alarm) => (
        <li key={alarm.name}>
          <StatusIcon status={alarm.level === "alarm" ? "fault" : "warning"} />
          {alarm.name}
        </li>
      ))}
    </ul>
  );
}

export function GridPanel({ grid, model }: { grid: Grid; model: System }) {
  const readings = gridReadings(grid);
  return (
    <Panel part="grid" title={partTitle("grid", model)} status={grid.status} state={gridState(grid)}>
      <Headline reading={readings.headline} />
      <Details readings={readings} />
    </Panel>
  );
}

export function GeneratorPanel({ generator }: { generator: Generator }) {
  const readings = generatorReadings(generator);
  return (
    <Panel part="generator" title="Generator" status={generator.status} state={generatorState(generator)}>
      <Headline reading={readings.headline} />
      <Details readings={readings} />
    </Panel>
  );
}

export function InverterChargerPanel({ inverter, model }: { inverter: InverterCharger; model: System }) {
  const readings = inverterReadings(inverter, model);
  return (
    <Panel part="inverter_charger" title="Inverter" status={inverter.status} state={inverterState(inverter)}>
      <Headline reading={readings.headline} />
      <Details readings={readings} />
      <Alarms alarms={inverter.alarms} />
    </Panel>
  );
}

export function BatteryPanel({ battery }: { battery: Battery }) {
  const readings = batteryReadings(battery);
  return (
    <Panel part="battery" title="Battery" status={battery.status} state={batteryState(battery)}>
      <Headline reading={readings.headline} />
      {battery.soc_percent !== null && (
        <div className="charge-bar" aria-hidden="true">
          <div style={{ width: `${Math.max(0, Math.min(100, battery.soc_percent))}%` }} />
        </div>
      )}
      <Details readings={readings} />
    </Panel>
  );
}

export function SolarPanel({ solar }: { solar: Solar }) {
  const readings = solarReadings(solar);
  return (
    <Panel part="solar" title="Solar" status={solar.status}
      state={solarState(solar)}>
      <Headline reading={readings.headline} />
      <Details readings={readings} />
      {solar.chargers.length > 1 && (
        <ul className="chargers">
          {solar.chargers.map((charger) => (
            <li key={charger.name}>
              <StatusIcon status={charger.status} />
              <span className="charger-name">{charger.name}</span>
              {charger.status === "offline" ? (
                <span>Not reporting</span>
              ) : (
                <Eased value={charger.power_w} format={f.power} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function AcLoadsPanel({ loads }: { loads: AcLoads }) {
  const readings = acLoadsReadings(loads);
  return (
    <Panel part="ac_loads" title="AC loads" status={loads.status} state="In use">
      <Headline reading={readings.headline} />
      <Details readings={readings} />
      {/* Each circuit its own meter measures, listed as solar lists its chargers. */}
      {loads.circuits.length > 0 && (
        <ul className="chargers">
          {loads.circuits.map((circuit) => (
            <li key={circuit.name}>
              <StatusIcon status={circuit.status} />
              <span className="charger-name">{circuit.name}</span>
              {circuit.status === "offline" ? (
                <span>Not reporting</span>
              ) : (
                <Eased value={circuit.power_w} format={f.power} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function DcLoadsPanel({ loads }: { loads: DcLoads }) {
  const readings = dcLoadsReadings(loads);
  return (
    <Panel part="dc_loads" title="DC loads" status={loads.status} state={dcLoadsState(loads)}>
      <Headline reading={readings.headline} />
      <Details readings={readings} />
    </Panel>
  );
}

import { useId, type ReactNode } from "react";

import type {
  AcLoads, Alarm, Battery, DcLoads, Generator, Grid, InverterCharger, InverterMode, InverterState, PartName, Solar,
  Status,
} from "../../model/system";
import { Eased } from "../Eased";
import * as f from "../format";
import { StatusIcon } from "../StatusIcon";

function Panel(props: { part: PartName; title: ReactNode; status: Status; state: string; children: ReactNode }) {
  const heading = useId();
  return (
    <section className={`panel status-${props.status}`} data-part={props.part} aria-labelledby={heading}>
      <header className="panel-header">
        <h2 id={heading}>{props.title}</h2>
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
function Headline({ value, format }: { value: number | null; format: f.Format }) {
  return (
    <p className="headline">
      <Eased value={value} format={format} />
    </p>
  );
}

/** One line of detail. Details the system does not report are left out unless `always`. */
function Reading(props: { label: string; value: number | null; format: f.Format; always?: boolean }) {
  if (props.value === null && !props.always) {
    return null;
  }
  return (
    <div className="reading">
      <dt>{props.label}</dt>
      <dd>
        <Eased value={props.value} format={props.format} />
      </dd>
    </div>
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

export function GridPanel({ grid }: { grid: Grid }) {
  const state = grid.connected === null ? "Unknown" : grid.connected ? "Connected" : "Disconnected";
  return (
    <Panel part="grid" title={grid.kind === "shore" ? "Shore power" : "Grid"} status={grid.status} state={state}>
      <Headline value={grid.power_w} format={f.power} />
      <dl>
        <Reading label="Voltage" value={grid.voltage_v} format={f.volts} />
        <Reading label="Current" value={grid.current_a} format={f.amps} />
        <Reading label="Frequency" value={grid.frequency_hz} format={f.hertz} />
        <Reading label="Input limit" value={grid.input_current_limit_a} format={f.amps} />
      </dl>
    </Panel>
  );
}

export function GeneratorPanel({ generator }: { generator: Generator }) {
  const state = generator.running === null ? "Unknown" : generator.running ? "Running" : "Stopped";
  return (
    <Panel part="generator" title="Generator" status={generator.status} state={state}>
      <Headline value={generator.power_w} format={f.power} />
      <dl>
        <Reading label="Running for" value={generator.run_time_s} format={f.duration} />
      </dl>
    </Panel>
  );
}

const MODES: Record<InverterMode, string> = {
  on: "On", off: "Off", charger_only: "Charger only", inverter_only: "Inverter only",
};

const INVERTER_STATES: Record<InverterState, string> = {
  off: "Off", low_power: "Low power", fault: "Fault", bulk: "Bulk", absorption: "Absorption", float: "Float",
  storage: "Storage", equalize: "Equalize", passthrough: "Passthrough", inverting: "Inverting",
  power_assist: "Power assist", power_supply: "Power supply", sustain: "Sustain",
  external_control: "External control", other: "Other",
};

export function InverterChargerPanel({ inverter }: { inverter: InverterCharger }) {
  return (
    // A narrow panel breaks the title after the slash, not inside a word.
    <Panel part="inverter_charger" title={<>Inverter/<wbr />charger</>} status={inverter.status}
      state={inverter.state === null ? "Unknown" : INVERTER_STATES[inverter.state]}>
      <Headline value={inverter.ac_out_power_w} format={f.power} />
      <dl>
        {inverter.mode !== null && (
          <div className="reading">
            <dt>Mode</dt>
            <dd>{MODES[inverter.mode]}</dd>
          </div>
        )}
        <Reading label="AC in" value={inverter.ac_in_power_w} format={f.power} />
        <Reading label="Charge current" value={inverter.charge_current_a} format={f.amps} />
      </dl>
      <Alarms alarms={inverter.alarms} />
    </Panel>
  );
}

export function BatteryPanel({ battery }: { battery: Battery }) {
  const state = { idle: "Idle", charging: "Charging", discharging: "Discharging" }[battery.activity ?? "idle"];
  const spread =
    battery.min_cell_voltage_v !== null && battery.max_cell_voltage_v !== null
      ? battery.max_cell_voltage_v - battery.min_cell_voltage_v
      : null;
  return (
    <Panel part="battery" title="Battery" status={battery.status} state={battery.activity === null ? "Unknown" : state}>
      <Headline value={battery.soc_percent} format={f.percent} />
      {battery.soc_percent !== null && (
        <div className="charge-bar" aria-hidden="true">
          <div style={{ width: `${Math.max(0, Math.min(100, battery.soc_percent))}%` }} />
        </div>
      )}
      <dl>
        <Reading label="Power" value={battery.power_w} format={f.power} always />
        <Reading label="Voltage" value={battery.voltage_v} format={f.volts} always />
        <Reading label="Current" value={battery.current_a} format={f.amps} />
        <Reading label="Temperature" value={battery.temperature_c} format={f.celsius} />
        <Reading label="Time to go" value={battery.time_to_go_s} format={f.duration} />
        <Reading label="Charge limit" value={battery.max_charge_current_a} format={f.amps} />
        <Reading label="Discharge limit" value={battery.max_discharge_current_a} format={f.amps} />
        <Reading label="Cell spread" value={spread} format={f.millivolts} />
      </dl>
    </Panel>
  );
}

export function SolarPanel({ solar }: { solar: Solar }) {
  return (
    <Panel part="solar" title="Solar" status={solar.status} state={solar.power_w ? "Producing" : "Not producing"}>
      <Headline value={solar.power_w} format={f.power} />
      <dl>
        <Reading label="Today" value={solar.yield_today_kwh} format={f.kilowattHours} />
      </dl>
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
  return (
    <Panel part="ac_loads" title="AC loads" status={loads.status} state="In use">
      <Headline value={loads.power_w} format={f.power} />
      <dl>
        <Reading label="On the inverter" value={loads.on_output_w} format={f.power} />
        <Reading label="On the supply side" value={loads.on_input_w} format={f.power} />
      </dl>
    </Panel>
  );
}

export function DcLoadsPanel({ loads }: { loads: DcLoads }) {
  const how = loads.measured_by === "meter" ? "Metered" : loads.measured_by === "calculation" ? "Calculated" : "In use";
  return (
    <Panel part="dc_loads" title="DC loads" status={loads.status} state={how}>
      <Headline value={loads.power_w} format={f.power} />
    </Panel>
  );
}

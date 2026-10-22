import { useId, type ReactNode } from "react";

import type { PartName, Status, System } from "../../model/system";
import {
  batteryState, generatorState, gridState, inverterState, MODES, partTitle, solarState,
} from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { flowSpeed } from "../minimal/flowSpeed";
import { StatusIcon } from "../StatusIcon";
import { Title } from "../Title";
import { Core, Row } from "./Core";
import "./fof.css";

interface PartSummary {
  part: PartName;
  status: Status;
  state: string;
}

function summaries(model: System): PartSummary[] {
  const rows: PartSummary[] = [];
  const add = (part: PartName, status: Status, state: string) =>
    rows.push({ part, status, state: status === "offline" ? "Not reporting" : state });
  if (model.grid) add("grid", model.grid.status, gridState(model.grid));
  if (model.generator) add("generator", model.generator.status, generatorState(model.generator));
  if (model.inverter_charger) add("inverter_charger", model.inverter_charger.status, inverterState(model.inverter_charger));
  if (model.battery) add("battery", model.battery.status, batteryState(model.battery));
  if (model.solar) add("solar", model.solar.status, solarState(model.solar));
  if (model.ac_loads) add("ac_loads", model.ac_loads.status, "In use");
  if (model.dc_loads) add("dc_loads", model.dc_loads.status, "In use");
  return rows;
}

function Readout(props: { part: PartName; title: string; status: Status; children: ReactNode }) {
  const heading = useId();
  return (
    <section className={`fof-readout status-${props.status}`} data-part={props.part} aria-labelledby={heading}>
      <h2>
        <StatusIcon status={props.status} />
        {/* The part is named by its title alone; its status is announced by the rail. */}
        <span id={heading}>
          <Title text={props.title} />
        </span>
      </h2>
      {props.status === "offline" ? <p className="fof-quiet">Not reporting</p> : <dl className="fof-rows">{props.children}</dl>}
    </section>
  );
}

// The second skin: an engineering console. A frame of rounded bars around a
// status rail, the battery as a glowing core, readouts for every other part,
// and the power moving between parts as conduits. All of it is drawn here in
// CSS, with no images.
export function FofSkin({ model }: { model: System }) {
  const parts = summaries(model);
  return (
    <div className="fof">
      <div className="fof-top" aria-hidden="true">
        <span className="fof-cap fof-cap-left" />
        <span className="fof-label">Power systems</span>
        <span className="fof-bar" />
        <span className={`fof-link ${model.live ? "fof-link-live" : "fof-link-stale"}`}>
          {model.live ? "Feed live" : "Feed stale"}
        </span>
        <span className="fof-cap fof-cap-right" />
      </div>

      <ul className="fof-rail" aria-label="Status">
        {parts.map((row) => (
          <li key={row.part} className={`fof-pill status-${row.status}`}>
            <StatusIcon status={row.status} />
            <span className="fof-pill-name">
              <Title text={partTitle(row.part, model)} />
            </span>
            <span className="fof-pill-state">{row.state}</span>
          </li>
        ))}
      </ul>

      {model.battery && <Core battery={model.battery} />}

      <div className="fof-main">
      <div className="fof-readouts">
        {model.grid && (
          <Readout part="grid" title={partTitle("grid", model)} status={model.grid.status}>
            <Row label="Power" value={model.grid.power_w} format={f.power} always />
            <Row label="Voltage" value={model.grid.voltage_v} format={f.volts} />
            <Row label="Current" value={model.grid.current_a} format={f.amps} />
            <Row label="Frequency" value={model.grid.frequency_hz} format={f.hertz} />
            <Row label="Input limit" value={model.grid.input_current_limit_a} format={f.amps} />
          </Readout>
        )}
        {model.generator && (
          <Readout part="generator" title="Generator" status={model.generator.status}>
            <Row label="Power" value={model.generator.power_w} format={f.power} always />
            <Row label="Running for" value={model.generator.run_time_s} format={f.duration} />
          </Readout>
        )}
        {model.inverter_charger && (
          <Readout part="inverter_charger" title="Inverter/charger" status={model.inverter_charger.status}>
            {model.inverter_charger.mode !== null && (
              <div className="fof-row">
                <dt>Mode</dt>
                <dd>{MODES[model.inverter_charger.mode]}</dd>
              </div>
            )}
            <Row label="AC out" value={model.inverter_charger.ac_out_power_w} format={f.power} always />
            <Row label="AC in" value={model.inverter_charger.ac_in_power_w} format={f.power} />
            <Row label="Charge current" value={model.inverter_charger.charge_current_a} format={f.amps} />
            {model.inverter_charger.alarms.map((alarm) => (
              <div key={alarm.name} className="fof-row fof-alarm">
                <dt>
                  <StatusIcon status={alarm.level === "alarm" ? "fault" : "warning"} />
                </dt>
                <dd>{alarm.name}</dd>
              </div>
            ))}
          </Readout>
        )}
        {model.solar && (
          <Readout part="solar" title="Solar" status={model.solar.status}>
            <Row label="Power" value={model.solar.power_w} format={f.power} always />
            <Row label="Today" value={model.solar.yield_today_kwh} format={f.kilowattHours} />
            {model.solar.chargers.length > 1 &&
              model.solar.chargers.map((charger) => (
                <div key={charger.name} className="fof-row">
                  <dt>
                    <StatusIcon status={charger.status} /> {charger.name}
                  </dt>
                  <dd>
                    {charger.status === "offline" ? "Not reporting" : <Eased value={charger.power_w} format={f.power} />}
                  </dd>
                </div>
              ))}
          </Readout>
        )}
        {model.ac_loads && (
          <Readout part="ac_loads" title="AC loads" status={model.ac_loads.status}>
            <Row label="Power" value={model.ac_loads.power_w} format={f.power} always />
            <Row label="Voltage" value={model.ac_loads.voltage_v} format={f.volts} />
            <Row label="Current" value={model.ac_loads.current_a} format={f.amps} />
            <Row label="Frequency" value={model.ac_loads.frequency_hz} format={f.hertz} />
            <Row label="On the inverter" value={model.ac_loads.on_output_w} format={f.power} />
            <Row label="On the supply side" value={model.ac_loads.on_input_w} format={f.power} />
          </Readout>
        )}
        {model.dc_loads && (
          <Readout part="dc_loads" title="DC loads" status={model.dc_loads.status}>
            <Row label="Power" value={model.dc_loads.power_w} format={f.power} always />
          </Readout>
        )}
      </div>

      <section className="fof-conduits" aria-label="Power transfer">
        <h2>Power transfer</h2>
        {model.flows.length === 0 && <p className="fof-quiet">No power moving</p>}
        {model.flows.map((flow) => (
          <div key={`${flow.source}-${flow.target}`} className={`fof-conduit fof-speed-${flowSpeed(flow.power_w)}`}
            data-flow={`${flow.source}-${flow.target}`}>
            <span className="fof-conduit-route">
              <Title text={partTitle(flow.source, model)} /> to <Title text={partTitle(flow.target, model)} />
            </span>
            <span className="fof-conduit-bar" aria-hidden="true" />
            <span className="fof-conduit-power">
              <Eased value={flow.power_w} format={f.power} />
            </span>
          </div>
        ))}
      </section>
      </div>

      <div className="fof-bottom" aria-hidden="true">
        <span className="fof-cap fof-cap-left" />
        <span className="fof-bar" />
        <span className="fof-cap fof-cap-right" />
      </div>
    </div>
  );
}

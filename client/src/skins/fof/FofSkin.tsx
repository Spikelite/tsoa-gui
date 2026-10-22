import { useId, type ReactNode } from "react";

import { Clock } from "../../Clock";
import type { PartName, Status, System } from "../../model/system";
import { generatorState, gridState, inverterState, MODES, partTitle, solarState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { Title } from "../Title";
import { Conduits } from "./Conduits";
import { Core, Row } from "./Core";
import { GeneratorCore } from "./GeneratorCore";
import { InverterCore } from "./InverterCore";
import { LoadPanel } from "./LoadPanel";
import { SkinSegment } from "./SkinSegment";
import { StatusPill, StatusWords } from "./StatusPill";
import { throughHub } from "./throughHub";
import "./fof.css";

function Readout(props: {
  part: PartName; title: string; status: Status; state: string; art?: ReactNode; beside?: boolean;
  children: ReactNode;
}) {
  const heading = useId();
  const offline = props.status === "offline";
  const rows = !offline && <dl className="fof-rows">{props.children}</dl>;
  return (
    <section className={`fof-readout status-${props.status}${props.beside ? " fof-readout-beside" : ""}`}
      data-part={props.part} aria-labelledby={heading}>
      {/* Conduits plug into the part's graphic, or into its name where it has none. */}
      <div className="fof-name-row" data-anchor={props.art ? undefined : true}>
        <h2 className="fof-label-block">
          <span id={heading}>
            <Title text={props.title} />
          </span>
          <StatusWords status={props.status} separator />
        </h2>
      </div>
      <p className="fof-state-line">{offline ? "Not reporting" : props.state}</p>
      {rows}
      {props.art}
    </section>
  );
}

// The second skin: the main view's layout as an engineering console. Supplies
// on the left, the inverter/charger's housing and the battery's bank of cells
// in the middle, loads on the right, with power moving between them through
// conduits, all inside a frame of rounded bars. Everything is drawn in CSS
// and SVG, with no images.
export function FofSkin({ model }: { model: System }) {
  return (
    <div className="fof">
      <div className="fof-top">
        <span className="fof-cap fof-cap-left" aria-hidden="true" />
        <span className="fof-label" aria-hidden="true">Power systems</span>
        <span className="fof-bar" aria-hidden="true" />
        <span className="fof-segment fof-clock-segment">
          <Clock />
        </span>
        <span className={`fof-link ${model.live ? "fof-link-live" : "fof-link-stale"}`} aria-hidden="true">
          {model.live ? "Feed live" : "Feed stale"}
        </span>
        <SkinSegment />
        <span className="fof-cap fof-cap-right" aria-hidden="true" />
      </div>

      <div className="fof-diagram">
        <Conduits flows={model.inverter_charger ? throughHub(model.flows) : model.flows} />

        {model.grid && (
          <Readout part="grid" title={partTitle("grid", model)} status={model.grid.status} state={gridState(model.grid)}>
            <Row label="Power" value={model.grid.power_w} format={f.power} always />
            <Row label="Voltage" value={model.grid.voltage_v} format={f.volts} />
            <Row label="Current" value={model.grid.current_a} format={f.amps} />
            <Row label="Frequency" value={model.grid.frequency_hz} format={f.hertz} />
            <Row label="Input limit" value={model.grid.input_current_limit_a} format={f.amps} />
          </Readout>
        )}

        {model.generator && (
          <Readout part="generator" title="Generator" status={model.generator.status}
            state={generatorState(model.generator)} art={<GeneratorCore generator={model.generator} />} beside>
            <Row label="Power" value={model.generator.power_w} format={f.power} always />
            <Row label="Running for" value={model.generator.run_time_s} format={f.duration} />
          </Readout>
        )}

        {model.inverter_charger && (
          <Readout part="inverter_charger" title="Inverter/charger" status={model.inverter_charger.status}
            state={inverterState(model.inverter_charger)} art={<InverterCore inverter={model.inverter_charger} />}>
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
                  <StatusPill status={alarm.level === "alarm" ? "fault" : "warning"} />
                </dt>
                <dd>{alarm.name}</dd>
              </div>
            ))}
          </Readout>
        )}

        {model.battery && <Core battery={model.battery} />}

        {model.solar && (
          <Readout part="solar" title="Solar" status={model.solar.status} state={solarState(model.solar)}>
            <Row label="Power" value={model.solar.power_w} format={f.power} always />
            <Row label="Today" value={model.solar.yield_today_kwh} format={f.kilowattHours} />
            {model.solar.chargers.length > 1 &&
              model.solar.chargers.map((charger) => (
                <div key={charger.name} className="fof-row">
                  <dt>
                    <StatusPill status={charger.status} /> {charger.name}
                  </dt>
                  <dd>
                    {charger.status === "offline" ? "Not reporting" : <Eased value={charger.power_w} format={f.power} />}
                  </dd>
                </div>
              ))}
          </Readout>
        )}

        {model.ac_loads && (
          <Readout part="ac_loads" title="AC loads" status={model.ac_loads.status} state="In use"
            art={<LoadPanel loads={model.ac_loads} />}>
            <Row label="Power" value={model.ac_loads.power_w} format={f.power} always />
            <Row label="Voltage" value={model.ac_loads.voltage_v} format={f.volts} />
            <Row label="Current" value={model.ac_loads.current_a} format={f.amps} />
            <Row label="Frequency" value={model.ac_loads.frequency_hz} format={f.hertz} />
            <Row label="On the inverter" value={model.ac_loads.on_output_w} format={f.power} />
            <Row label="On the supply side" value={model.ac_loads.on_input_w} format={f.power} />
          </Readout>
        )}

        {model.dc_loads && (
          <Readout part="dc_loads" title="DC loads" status={model.dc_loads.status}
            state={model.dc_loads.measured_by === "meter" ? "Metered" : "Calculated"}>
            <Row label="Power" value={model.dc_loads.power_w} format={f.power} always />
          </Readout>
        )}
      </div>

      <div className="fof-bottom" aria-hidden="true">
        <span className="fof-cap fof-cap-left" />
        <span className="fof-bar" />
        <span className="fof-cap fof-cap-right" />
      </div>
    </div>
  );
}

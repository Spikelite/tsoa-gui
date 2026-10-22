import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

import { Clock } from "../../Clock";
import type { PartName, Status, System } from "../../model/system";
import { generatorState, gridState, inverterState, partTitle, solarState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import {
  acLoadsReadings, dcLoadsReadings, dcLoadsState, generatorReadings, gridReadings, inverterReadings, solarReadings,
  type Readings,
} from "../readings";
import { Title } from "../Title";
import { Conduits } from "./Conduits";
import { Core, Rows } from "./Core";
import { GeneratorCore } from "./GeneratorCore";
import { GridTower } from "./GridTower";
import { InverterCore } from "./InverterCore";
import { LoadPanel } from "./LoadPanel";
import { SkinSegment } from "./SkinSegment";
import { SolarArray } from "./SolarArray";
import { NamePill, StatusWords } from "./StatusPill";
import { withIdleLinks } from "./links";
import { throughHub } from "./throughHub";
import "./fof.css";

/** Which of the hub's two AC inputs each supply plugs into, where the inverter/charger has two. */
function hubInputs(model: System): Partial<Record<PartName, 1 | 2>> {
  if ((model.inverter_charger?.ac_inputs ?? 1) < 2) {
    return {};
  }
  return {
    ...(model.grid?.ac_input ? { grid: model.grid.ac_input } : {}),
    ...(model.generator?.ac_input ? { generator: model.generator.ac_input } : {}),
  };
}

/** A part's readings as rows, its headline first. */
const all = (readings: Readings) => [readings.headline, ...readings.details];

function Readout(props: {
  part: PartName; title: string; status: Status; state: string; art?: ReactNode;
  /**
   * Where the equipment sits: below the readings, beside them, leading them
   * with the name above it, as a hub with the name above it and the readings
   * tucked into the corner below and right of it, between its spokes, on
   * top, between the name and the readings, or as a schematic, the grid's or
   * the solar's, with the readings in the drawing's open space above the track
   * its conduit sets off from.
   */
  layout?: "below" | "lead" | "hub" | "top" | "schematic";
  children: ReactNode;
}) {
  const heading = useId();
  const offline = props.status === "offline";
  const rows = !offline && <dl className="fof-rows">{props.children}</dl>;
  return (
    <section className={`fof-readout status-${props.status} fof-readout-${props.layout ?? "below"}`}
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
  const root = useRef<HTMLDivElement>(null);

  // A CSS animation counts from when it starts, and the skin's start at
  // different moments: a conduit once the panels are measured, and any
  // animation again whenever its pace changes. Pinning them all to the
  // page's clock keeps the ones timed to each other, a conduit and what it
  // feeds or is fed by, in step.
  useLayoutEffect(() => {
    root.current?.getAnimations?.({ subtree: true }).forEach((animation) => {
      if (animation.startTime !== 0) {
        animation.startTime = 0;
      }
    });
  });

  return (
    <div ref={root} className="fof">
      <div className="fof-top">
        <span className="fof-cap fof-cap-left" aria-hidden="true" />
        <span className="fof-label" aria-hidden="true">Power systems</span>
        <span className="fof-bar" aria-hidden="true" />
        <span className="fof-segment fof-clock-segment">
          <Clock />
        </span>
        <span className={`fof-link ${model.live ? "fof-link-live" : "fof-link-stale"}`} aria-hidden="true">
          {model.live ? "Live" : "Stale"}
        </span>
        <SkinSegment />
        <span className="fof-cap fof-cap-right" aria-hidden="true" />
      </div>

      <div className="fof-diagram">
        <Conduits flows={withIdleLinks(model.inverter_charger ? throughHub(model.flows) : model.flows, model)}
          inputs={hubInputs(model)} />

        {model.grid && (
          <Readout part="grid" title={partTitle("grid", model)} status={model.grid.status} state={gridState(model.grid)}
            art={<GridTower grid={model.grid} />} layout="schematic">
            <Rows readings={all(gridReadings(model.grid))} />
          </Readout>
        )}

        {model.generator && (
          <Readout part="generator" title="Generator" status={model.generator.status}
            state={generatorState(model.generator)} art={<GeneratorCore generator={model.generator} />} layout="schematic">
            <Rows readings={all(generatorReadings(model.generator))} />
          </Readout>
        )}

        {model.inverter_charger && (
          <Readout part="inverter_charger" title="Inverter/charger" status={model.inverter_charger.status}
            state={inverterState(model.inverter_charger)} art={<InverterCore inverter={model.inverter_charger} />}
            layout="hub">
            <Rows readings={all(inverterReadings(model.inverter_charger, model))} />
            {model.inverter_charger.alarms.map((alarm) => (
              <div key={alarm.name} className="fof-row fof-alarm">
                <dt>
                  <NamePill name={alarm.name} status={alarm.level === "alarm" ? "fault" : "warning"} />
                </dt>
              </div>
            ))}
          </Readout>
        )}

        {model.battery && <Core battery={model.battery} />}

        {model.solar && (
          <Readout part="solar" title="Solar" status={model.solar.status} state={solarState(model.solar)}
            art={<SolarArray solar={model.solar} />} layout="schematic">
            <Rows readings={all(solarReadings(model.solar))} />
            {model.solar.chargers.length > 1 &&
              model.solar.chargers.map((charger) => (
                <div key={charger.name} className="fof-row">
                  <dt>
                    <NamePill name={charger.name} status={charger.status} />
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
            art={<LoadPanel power={model.ac_loads.power_w} status={model.ac_loads.status} feed="inverter_charger-ac_loads" />}
            layout="lead">
            <Rows readings={all(acLoadsReadings(model.ac_loads))} />
          </Readout>
        )}

        {model.dc_loads && (
          <Readout part="dc_loads" title="DC loads" status={model.dc_loads.status}
            state={dcLoadsState(model.dc_loads)}
            art={<LoadPanel power={model.dc_loads.power_w} status={model.dc_loads.status} feed="battery-dc_loads" />}
            layout="lead">
            <Rows readings={all(dcLoadsReadings(model.dc_loads))} />
          </Readout>
        )}
      </div>

      <div className="fof-bottom">
        {/* The frame carries the application's name, in place of the page header's. */}
        <h1 className="fof-cap fof-cap-left fof-app-name">tsoa-gui</h1>
        <span className="fof-bar" aria-hidden="true" />
        <span className="fof-cap fof-cap-right" aria-hidden="true" />
      </div>
    </div>
  );
}

import { useCallback, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { Clock } from "../../Clock";
import type { PartName, Status, System } from "../../model/system";
import { generatorState, gridState, inverterState, partTitle, solarState } from "../describe";
import { DETAILED, detailedPart } from "../details";
import { Eased } from "../Eased";
import { link, LINK_SENTENCES, LINK_WORDS } from "../link";
import { closePart, openedFrom, openPart, partAddress, useEscapeCloses, usePart } from "../partView";
import * as f from "../format";
import {
  acLoadsReadings, dcLoadsReadings, dcLoadsState, generatorReadings, gridReadings, inverterReadings, solarReadings,
  type Readings,
} from "../readings";
import { Title } from "../Title";
import { BatteryDeck } from "./BatteryDeck";
import { InverterDeck } from "./InverterDeck";
import { Conduits } from "./Conduits";
import { Core, Rows } from "./Core";
import { GeneratorCore } from "./GeneratorCore";
import { GridTower } from "./GridTower";
import type { HubPorts } from "./hubPorts";
import { InverterCore } from "./InverterCore";
import { LoadPanel } from "./LoadPanel";
import { SkinSegment } from "./SkinSegment";
import { SolarArray } from "./SolarArray";
import { NamePill, StatusWords } from "./StatusPill";
import { withIdleLinks } from "./links";
import { throughHub } from "./throughHub";
import "./fof.css";

/**
 * Where on the hub's left side each supply plugs in: at the AC input it is
 * wired to, where the inverter/charger has two. With one input that both a
 * grid or shore supply and a generator share, through a transfer switch,
 * they still meet the hub apart, the grid or shore supply above and the
 * generator below, so their conduits never lie one over the other.
 */
function hubInputs(model: System): Partial<Record<PartName, 1 | 2>> {
  if ((model.inverter_charger?.ac_inputs ?? 1) >= 2) {
    return {
      ...(model.grid?.ac_input ? { grid: model.grid.ac_input } : {}),
      ...(model.generator?.ac_input ? { generator: model.generator.ac_input } : {}),
    };
  }
  return model.grid && model.generator ? { grid: 1, generator: 2 } : {};
}

/** A part's readings as rows, its headline first. */
const all = (readings: Readings) => [readings.headline, ...readings.details];

function Readout(props: {
  part: PartName; title: string; status: Status; state: string; art?: ReactNode;
  /**
   * Where the equipment sits: below the readings, beside them, leading them
   * with the name above it, as a hub with the name above it and the readings
   * at its top right, above the spoke leaving its right side, on
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
  // A part with a page of its own opens it from anywhere on it; its name is
  // the link to it, for the keyboard and for a screen reader.
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
    <section className={`fof-readout status-${props.status} fof-readout-${props.layout ?? "below"}${
      detailed ? " fof-opens" : ""}`} data-part={props.part} aria-labelledby={heading}
      onClick={detailed ? open : undefined}>
      {/* Conduits plug into the part's graphic, or into its name where it has none. */}
      <div className="fof-name-row" data-anchor={props.art ? undefined : true}>
        <h2 className="fof-label-block">
          {detailed ? (
            <a id={heading} className="fof-open-link" href={partAddress(props.part)} onClick={open}>
              <Title text={props.title} />
            </a>
          ) : (
            <span id={heading}>
              <Title text={props.title} />
            </span>
          )}
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
export function FofSkin({ model, connected = true }: { model: System; connected?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  // Where the conduits meet the hub, which they work out once laid out and
  // the hub needs to carry them on into its windings.
  const [hub, setHub] = useState<HubPorts>();
  const heardHub = useCallback((ports: HubPorts) => {
    setHub((previous) => (JSON.stringify(previous) === JSON.stringify(ports) ? previous : ports));
  }, []);
  const state = link(model, connected);
  const part = detailedPart(usePart(), model);
  useEscapeCloses(part !== null);
  const from = openedFrom();

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
    <div ref={root} className={`fof${part !== null ? " fof-paged" : ""}`}>
      <div className="fof-top">
        <span className="fof-cap fof-cap-left" aria-hidden="true" />
        <span className="fof-label" aria-hidden="true">Power systems</span>
        <span className="fof-bar" aria-hidden="true" />
        {/* On a part's own page, the way back to the whole system. */}
        {part !== null && (
          <button type="button" className="fof-segment fof-back-segment" aria-label="Overview" onClick={closePart}>
            {/* A phone's top bar has room for only the shorter word. */}
            <span className="fof-back-long" aria-hidden="true">Overview</span>
            <span className="fof-back-short" aria-hidden="true">Back</span>
          </button>
        )}
        <span className="fof-segment fof-clock-segment">
          <Clock />
        </span>
        {/* How current the readings are: one word on screen, the whole of it for a screen reader. */}
        <span className={`fof-link fof-link-${state}`} role="status">
          <span aria-hidden="true">{LINK_WORDS[state]}</span>
          <span className="fof-quiet">{LINK_SENTENCES[state]}</span>
        </span>
        <SkinSegment />
        <span className="fof-cap fof-cap-right" aria-hidden="true" />
      </div>

      {part !== null ? (
        // The page grows out of where the part was on the overview.
        <div className="fof-page" style={from ? { transformOrigin: `${from.x * 100}% ${from.y * 100}%` } : undefined}>
          {part === "battery" && model.battery && <BatteryDeck battery={model.battery} />}
          {part === "inverter_charger" && model.inverter_charger && (
            <InverterDeck inverter={model.inverter_charger} model={model} />
          )}
        </div>
      ) : (
      <div className="fof-diagram">
        <Conduits flows={withIdleLinks(model.inverter_charger ? throughHub(model.flows) : model.flows, model)}
          inputs={hubInputs(model)} onHubPorts={heardHub} />

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
          <Readout part="inverter_charger" title="Inverter" status={model.inverter_charger.status}
            state={inverterState(model.inverter_charger)} art={<InverterCore inverter={model.inverter_charger} hub={hub} />}
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
            art={<LoadPanel power={model.dc_loads.power_w} status={model.dc_loads.status} feed="dc_bus-dc_loads" />}
            layout="lead">
            <Rows readings={all(dcLoadsReadings(model.dc_loads))} />
          </Readout>
        )}
      </div>
      )}

      <div className="fof-bottom">
        {/* The frame carries the application's name, in place of the page header's. */}
        <h1 className="fof-cap fof-cap-left fof-app-name">tsoa-gui</h1>
        <span className="fof-bar" aria-hidden="true" />
        <span className="fof-cap fof-cap-right" aria-hidden="true" />
      </div>
    </div>
  );
}

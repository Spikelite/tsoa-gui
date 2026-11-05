import type { MouseEvent } from "react";

import type { PartName, System } from "../../model/system";
import { batteryState, generatorState, gridState, inverterState, MODES, partTitle, solarState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { openPart, partAddress } from "../partView";
import { dcLoadsState } from "../readings";
import { raised, sideFigure, SIDEBAR } from "./sidebar";

/** What a part is doing, in the words the overview uses. */
function stateOf(part: PartName, model: System): string {
  const { grid, generator, solar, inverter_charger: inverter, battery, dc_loads: dc } = model;
  switch (part) {
    case "grid":
      return grid ? gridState(grid) : "";
    case "generator":
      return generator ? generatorState(generator) : "";
    case "solar":
      return solar ? solarState(solar) : "";
    case "inverter_charger":
      return inverter ? inverterState(inverter) : "";
    case "battery":
      return battery ? batteryState(battery) : "";
    case "dc_loads":
      return dc ? dcLoadsState(dc) : "";
    default:
      return "In use";
  }
}

/** The one line that says most about a part after its state, where it has one. */
function noteOn(part: PartName, model: System): string | null {
  const { grid, generator, solar, inverter_charger: inverter, battery, ac_loads: ac } = model;
  if (part === "grid" && grid?.input_current_limit_a != null) {
    return `Limit ${f.amps(grid.input_current_limit_a)}`;
  }
  if (part === "generator" && generator?.run_time_s != null) {
    return `Running for ${f.duration(generator.run_time_s)}`;
  }
  if (part === "solar" && solar?.yield_today_kwh != null) {
    return `${f.kilowattHours(solar.yield_today_kwh)} today`;
  }
  if (part === "inverter_charger" && inverter?.mode != null) {
    return `Mode ${MODES[inverter.mode].toLowerCase()}`;
  }
  if (part === "battery" && battery?.power_w != null) {
    const power = `${battery.power_w < 0 ? "-" : "+"}${f.power(Math.abs(battery.power_w))}`;
    const left = battery.time_left;
    return left ? `${power}, ${left.toward} in ${f.timeLeft(left).toLowerCase()}` : power;
  }
  if (part === "ac_loads" && ac) {
    const metered = ac.circuits.flatMap((circuit) =>
      circuit.power_w === null || circuit.status === "offline" ? [] : [`${circuit.name} ${f.power(Math.abs(circuit.power_w))}`]);
    return metered.length > 0 ? metered.join(", ") : null;
  }
  return null;
}

// The overview on a phone held upright, which has no room for the diagram: a
// row for each part with its state, its figure and a line that is lit while
// power flows through it. Every row opens the part's page.
export function PartList({ model }: { model: System }) {
  const parts = raised(model);
  const open = (event: MouseEvent<HTMLAnchorElement>, name: PartName) => {
    event.preventDefault();
    openPart(name, event.currentTarget);
  };
  return (
    <nav className="fof-list" aria-label="Parts">
      {SIDEBAR.filter((name) => model[name] !== null).map((name) => {
        const own = parts.find((entry) => entry.part === name);
        const figure = sideFigure(name, model);
        const flowing = model.flows.some(({ source, target }) => source === name || target === name);
        const note = own?.word ?? noteOn(name, model);
        return (
          <a key={name} href={partAddress(name)} data-side={name} className={own && `fof-list-raised status-${own.status}`}
            onClick={(event) => open(event, name)}>
            <span className="fof-list-name">{partTitle(name, model)}</span>
            <span className="fof-list-about">
              <b>{model[name]?.status === "offline" ? "Not reporting" : stateOf(name, model)}</b>
              {note !== null && <small>{note}</small>}
              <i className={flowing ? "fof-list-flowing" : undefined} aria-hidden="true" />
            </span>
            <span className={`fof-list-figure${figure.value ? "" : " fof-list-idle"}`}>
              <Eased value={figure.value} format={figure.format} />
            </span>
          </a>
        );
      })}
    </nav>
  );
}

import type { Flow, PartName, System } from "../../model/system";

/** Every way power can run between the parts, in the direction it usually does. */
const LINKS: [PartName, PartName][] = [
  ["grid", "inverter_charger"],
  ["generator", "inverter_charger"],
  ["inverter_charger", "ac_loads"],
  ["inverter_charger", "battery"],
  ["solar", "battery"],
  ["battery", "dc_loads"],
];

/**
 * The flows, with an idle one, at no power, for every link between two parts
 * the system has that carries nothing either way just now, so each part is
 * always drawn connected to the rest: a generator that is stopped, or solar at
 * night, still has its conduit, dim and still.
 */
export function withIdleLinks(flows: Flow[], model: System): Flow[] {
  const carrying = new Set(flows.flatMap((flow) => [`${flow.source}-${flow.target}`, `${flow.target}-${flow.source}`]));
  const idle = LINKS.filter(([source, target]) => model[source] && model[target] && !carrying.has(`${source}-${target}`))
    .map(([source, target]) => ({ source, target, power_w: 0 }));
  return [...flows, ...idle];
}

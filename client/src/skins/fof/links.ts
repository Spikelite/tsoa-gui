import type { Flow, FlowEnd, System } from "../../model/system";

/**
 * Whether the DC side has more on it than the battery and the
 * inverter/charger, so that its parts meet at the DC bus, as the server
 * decides it (flows.py).
 */
export function usesDcBus(model: System): boolean {
  return model.battery !== null && (model.solar !== null || model.dc_loads !== null);
}

/** Every way power can run between the parts, in the direction it usually does. */
function links(model: System): [FlowEnd, FlowEnd][] {
  const ac: [FlowEnd, FlowEnd][] = [
    ["grid", "inverter_charger"],
    ["generator", "inverter_charger"],
    ["inverter_charger", "ac_loads"],
  ];
  return usesDcBus(model)
    ? [...ac, ["inverter_charger", "dc_bus"], ["solar", "dc_bus"], ["dc_bus", "dc_loads"], ["dc_bus", "battery"]]
    : [...ac, ["inverter_charger", "battery"]];
}

const has = (model: System, end: FlowEnd) => (end === "dc_bus" ? usesDcBus(model) : model[end] !== null);

/**
 * The flows, with an idle one, at no power, for every link between two parts
 * the system has that carries nothing either way just now, so each part is
 * always drawn connected to the rest: a generator that is stopped, or solar at
 * night, still has its conduit, dim and still.
 */
export function withIdleLinks(flows: Flow[], model: System): Flow[] {
  const carrying = new Set(flows.flatMap((flow) => [`${flow.source}-${flow.target}`, `${flow.target}-${flow.source}`]));
  const idle = links(model).filter(([source, target]) => has(model, source) && has(model, target) &&
    !carrying.has(`${source}-${target}`))
    .map(([source, target]) => ({ source, target, power_w: 0 }));
  return [...flows, ...idle];
}

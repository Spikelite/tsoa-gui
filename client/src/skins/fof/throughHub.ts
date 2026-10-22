import type { Flow, FlowEnd } from "../../model/system";

const HUB: FlowEnd = "inverter_charger";

/**
 * The flows as Sci-Fi FOF draws them, through the inverter/charger's hub.
 * Power going from a supply straight to the AC loads is drawn through the
 * hub with the rest, added to the supply's flow into the hub and to the
 * hub's flow out to the loads, so that every wave bound for the loads passes
 * through it and no conduit crosses it. The AC loads only ever take power,
 * so nothing flows back out of them.
 */
export function throughHub(flows: Flow[]): Flow[] {
  const legs = new Map<string, Flow>();
  const add = (source: FlowEnd, target: FlowEnd, power: number) => {
    const key = `${source}-${target}`;
    const leg = legs.get(key);
    legs.set(key, { source, target, power_w: (leg?.power_w ?? 0) + power });
  };
  for (const flow of flows) {
    if (flow.target === "ac_loads" && flow.source !== HUB) {
      add(flow.source, HUB, flow.power_w);
      add(HUB, "ac_loads", flow.power_w);
    } else {
      add(flow.source, flow.target, flow.power_w);
    }
  }
  return [...legs.values()];
}

import { describe, expect, it } from "vitest";

import { system } from "../../test/system";
import { withIdleLinks } from "./links";

describe("withIdleLinks", () => {
  it("adds an idle link for each pair of parts the system has that carries nothing", () => {
    // The test system has no generator, and its DC loads take nothing from the DC bus.
    const drawn = withIdleLinks(system.flows, system);
    expect(drawn.slice(0, system.flows.length)).toEqual(system.flows);
    expect(drawn.slice(system.flows.length)).toEqual([{ source: "dc_bus", target: "dc_loads", power_w: 0 }]);
  });

  it("does not add a link that already carries power the other way", () => {
    const flows = [{ source: "dc_bus" as const, target: "inverter_charger" as const, power_w: 400 }];
    const drawn = withIdleLinks(flows, system);
    expect(drawn.filter((flow) => flow.source === "inverter_charger" && flow.target === "dc_bus")).toEqual([]);
  });

  it("joins the inverter/charger straight to a battery with nothing else on the DC side", () => {
    const bare = { ...system, solar: null, dc_loads: null, flows: [] };
    expect(withIdleLinks([], bare).filter((flow) => [flow.source, flow.target].includes("battery"))).toEqual([
      { source: "inverter_charger", target: "battery", power_w: 0 },
    ]);
  });

  it("adds nothing for a part the system does not have", () => {
    expect(withIdleLinks([], system).some((flow) => flow.source === "generator")).toBe(false);
  });
});

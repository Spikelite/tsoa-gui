import { describe, expect, it } from "vitest";

import { system } from "../../test/system";
import { withIdleLinks } from "./links";

describe("withIdleLinks", () => {
  it("adds an idle link for each pair of parts the system has that carries nothing", () => {
    // The test system has no generator, and its battery and DC loads carry nothing between them.
    const drawn = withIdleLinks(system.flows, system);
    expect(drawn.slice(0, system.flows.length)).toEqual(system.flows);
    expect(drawn.slice(system.flows.length)).toEqual([{ source: "battery", target: "dc_loads", power_w: 0 }]);
  });

  it("does not add a link that already carries power the other way", () => {
    const flows = [{ source: "battery" as const, target: "inverter_charger" as const, power_w: 400 }];
    const drawn = withIdleLinks(flows, system);
    expect(drawn.filter((flow) => flow.source === "inverter_charger" && flow.target === "battery")).toEqual([]);
  });

  it("adds nothing for a part the system does not have", () => {
    expect(withIdleLinks([], system).some((flow) => flow.source === "generator")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import type { AcCircuit, AcLoads } from "../model/system";
import { system } from "../test/system";
import { powerShares } from "./details";

const circuit = (name: string, power_w: number | null, status: AcCircuit["status"] = "normal"): AcCircuit => ({
  ...system.ac_loads!.circuits[0]!, name, power_w, status,
});
const loads = (power_w: number | null, ...circuits: AcCircuit[]): AcLoads => ({ ...system.ac_loads!, power_w, circuits });

describe("where a panel's power goes", () => {
  it("shares the total among its circuits, and calls the rest not metered", () => {
    expect(powerShares(loads(600, circuit("Kitchen", 250), circuit("Workshop", 100)))).toEqual([
      { label: "Kitchen", power_w: 250, metered: true },
      { label: "Workshop", power_w: 100, metered: true },
      { label: "Not metered", power_w: 250, metered: false },
    ]);
  });

  it("counts a circuit that is not reporting in the rest", () => {
    expect(powerShares(loads(600, circuit("Kitchen", 250), circuit("Workshop", 100, "offline"), circuit("Barn", null))))
      .toEqual([
        { label: "Kitchen", power_w: 250, metered: true },
        { label: "Not metered", power_w: 350, metered: false },
      ]);
  });

  it("takes a meter's size when it reads the other way", () => {
    expect(powerShares(loads(250, circuit("Kitchen", -250)))).toEqual([{ label: "Kitchen", power_w: 250, metered: true }]);
  });

  it("leaves nothing over when the meters come to the total or more, or the total is not known", () => {
    expect(powerShares(loads(300, circuit("Kitchen", 200), circuit("Workshop", 150))).map(({ label }) => label))
      .toEqual(["Kitchen", "Workshop"]);
    expect(powerShares(loads(null, circuit("Kitchen", 200))).map(({ label }) => label)).toEqual(["Kitchen"]);
  });

  it("says nothing with no circuit reporting, since the total alone does not say where it goes", () => {
    expect(powerShares(loads(600))).toEqual([]);
    expect(powerShares(loads(600, circuit("Kitchen", null)))).toEqual([]);
  });
});

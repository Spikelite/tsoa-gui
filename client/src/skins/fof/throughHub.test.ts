import { describe, expect, it } from "vitest";

import { throughHub } from "./throughHub";

describe("throughHub", () => {
  it("draws power from a supply to the AC loads through the hub", () => {
    expect(
      throughHub([
        { source: "grid", target: "inverter_charger", power_w: 1050 },
        { source: "grid", target: "ac_loads", power_w: 200 },
        { source: "inverter_charger", target: "ac_loads", power_w: 700 },
        { source: "inverter_charger", target: "battery", power_w: 317 },
      ]),
    ).toEqual([
      { source: "grid", target: "inverter_charger", power_w: 1250 },
      { source: "inverter_charger", target: "ac_loads", power_w: 900 },
      { source: "inverter_charger", target: "battery", power_w: 317 },
    ]);
  });

  it("adds the legs a supply's direct flow needs when the hub has none", () => {
    expect(throughHub([{ source: "generator", target: "ac_loads", power_w: 400 }])).toEqual([
      { source: "generator", target: "inverter_charger", power_w: 400 },
      { source: "inverter_charger", target: "ac_loads", power_w: 400 },
    ]);
  });

  it("leaves flows that do not reach the AC loads alone", () => {
    const flows = [
      { source: "battery" as const, target: "inverter_charger" as const, power_w: 500 },
      { source: "solar" as const, target: "battery" as const, power_w: 300 },
    ];
    expect(throughHub(flows)).toEqual(flows);
  });
});

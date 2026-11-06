import { describe, expect, it } from "vitest";

import type { AcCircuit, AcLoads, DcLoads } from "../model/system";
import { system } from "../test/system";
import { dcLoadsGroups, powerShares } from "./details";

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

  it("leaves out a circuit drawing nothing, though its meter still says the rest is not on it", () => {
    expect(powerShares(loads(100, circuit("Kitchen", 100), circuit("Workshop", 0))).map(({ label }) => label))
      .toEqual(["Kitchen"]);
    expect(powerShares(loads(100, circuit("Kitchen", 0)))).toEqual([{ label: "Not metered", power_w: 100, metered: false }]);
  });

  it("says nothing with no circuit reporting, since the total alone does not say where it goes", () => {
    expect(powerShares(loads(600))).toEqual([]);
    expect(powerShares(loads(600, circuit("Kitchen", null)))).toEqual([]);
  });

  it("finds nothing left over from what is only rounding", () => {
    expect(powerShares(loads(250.000001, circuit("Kitchen", 250))).map(({ label }) => label)).toEqual(["Kitchen"]);
  });
});

describe("the DC loads' readings", () => {
  const loads = (changes: Partial<DcLoads>): DcLoads => ({ ...system.dc_loads!, ...changes });
  const reading = (from: DcLoads, label: string) =>
    dcLoadsGroups(from, system)[0]!.readings.find((shown) => shown.label === label);

  it("gives each circuit a group of its own, after the loads as a whole", () => {
    expect(dcLoadsGroups(loads({ power_w: 20 }), system).map(({ title }) => title))
      .toEqual(["Loads", "12V cabin lighting", "24V bilge pump"]);
  });

  it("says what its circuits' meters do not account for", () => {
    expect(reading(loads({ power_w: 20.3 }), "Not metered")).toMatchObject({ value: 14 });
  });

  it("gives the whole a current at the battery's voltage while it is on the battery's bus", () => {
    const voltage = system.battery!.voltage_v!;
    expect(reading(loads({ power_w: 20 }), "Voltage")).toMatchObject({ value: voltage });
    expect(reading(loads({ power_w: 20 }), "Current")).toMatchObject({ value: 20 / voltage });
  });

  it("gives none to circuits added up, which can each be at a voltage of their own", () => {
    const added = loads({ power_w: 6.3, measured_by: "circuits" });
    expect(reading(added, "Voltage")).toMatchObject({ value: null });
    expect(reading(added, "Current")).toMatchObject({ value: null });
  });
});

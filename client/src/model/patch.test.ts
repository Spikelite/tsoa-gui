import { describe, expect, it } from "vitest";

import { applyPatch } from "./patch";

describe("applyPatch", () => {
  it("changes only what the patch holds", () => {
    const model = { live: true, battery: { soc_percent: 50, voltage_v: 25.6 } };
    expect(applyPatch(model, { battery: { soc_percent: 51 } })).toEqual({
      live: true,
      battery: { soc_percent: 51, voltage_v: 25.6 },
    });
  });

  it("sets a reading to null rather than removing it", () => {
    const patched = applyPatch({ battery: { soc_percent: 50 } }, { battery: { soc_percent: null } });
    expect(patched).toEqual({ battery: { soc_percent: null } });
    expect("soc_percent" in patched.battery).toBe(true);
  });

  it("adds and removes whole parts", () => {
    const grid = { status: "normal", connected: true };
    expect(applyPatch({ grid: null }, { grid })).toEqual({ grid });
    expect(applyPatch({ grid }, { grid: null })).toEqual({ grid: null });
  });

  it("replaces lists whole", () => {
    const model = { flows: [{ source: "solar", target: "battery", power_w: 100 }] };
    expect(applyPatch(model, { flows: [] })).toEqual({ flows: [] });
  });

  it("leaves the model it was given unchanged", () => {
    const model = { battery: { soc_percent: 50 } };
    applyPatch(model, { battery: { soc_percent: 60 } });
    expect(model.battery.soc_percent).toBe(50);
  });

  it("refuses anything but an object", () => {
    expect(() => applyPatch({}, [1])).toThrow();
  });
});

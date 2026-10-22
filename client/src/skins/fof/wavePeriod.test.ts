import { describe, expect, it } from "vitest";

import { steadyPeriod, wavePeriod } from "./wavePeriod";

describe("wavePeriod", () => {
  it("pulses more often with more power, relaxed at everyday power and fast at very high power", () => {
    expect(wavePeriod(100)).toBeCloseTo(8);
    expect(wavePeriod(600)).toBeGreaterThan(4);
    expect(wavePeriod(10_000)).toBeLessThan(2);
    expect(wavePeriod(1_000)).toBeLessThan(wavePeriod(900));
  });

  it("stays within its bounds", () => {
    expect(wavePeriod(0)).toBe(12);
    expect(wavePeriod(10_000_000)).toBe(0.6);
  });

  it("treats power flowing either way alike", () => {
    expect(wavePeriod(-500)).toBe(wavePeriod(500));
  });
});

describe("steadyPeriod", () => {
  it("rounds the period to steps", () => {
    expect(steadyPeriod(undefined, 600)).toBe(steadyPeriod(undefined, 610));
  });

  it("keeps its step while the power hovers at a boundary, and moves once the power is well past it", () => {
    const first = steadyPeriod(undefined, 1_000);
    expect(steadyPeriod(first, 1_060)).toBe(first);
    expect(steadyPeriod(first, 960)).toBe(first);
    expect(steadyPeriod(first, 2_000)).toBeLessThan(first);
  });
});

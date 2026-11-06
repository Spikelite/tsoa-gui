import { describe, expect, it } from "vitest";

import { smallAmps, smallPower } from "./format";

describe("figures that can be small", () => {
  it("keeps a decimal under 10 W and two under 10 A", () => {
    expect([6.3, 0.07].map(smallPower)).toEqual(["6.3 W", "0.1 W"]);
    expect([0.486, 0.006].map(smallAmps)).toEqual(["0.49 A", "0.01 A"]);
  });

  it("goes back to the usual figures above that", () => {
    expect([12.4, 1500].map(smallPower)).toEqual(["12 W", "1.50 kW"]);
    expect(smallAmps(12.34)).toBe("12.3 A");
  });

  it("writes a reading just under zero as zero, and one further under with its sign", () => {
    expect(smallPower(-0.01)).toBe("0.0 W");
    expect(smallAmps(-0.001)).toBe("0.00 A");
    expect(smallPower(-2.5)).toBe("-2.5 W");
  });
});

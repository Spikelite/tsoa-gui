import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Deck } from "./fof/Deck";
import * as f from "./format";
import { keysFor } from "./keys";
import { PartPage } from "./minimal/PartPage";
import type { DetailGroup } from "./details";

describe("keysFor", () => {
  it("keeps every key apart, whatever the names", () => {
    const keys = keysFor(["Battery", "Battery", "1:Battery", "Sensor", "Battery"]);
    expect(new Set(keys).size).toBe(5);
  });
});

// A device names its own temperature sensors, so one can share a label with
// a reading beside it, and two groups can share a title.
function groups(first: number | null, second: number): DetailGroup[] {
  return [
    {
      title: "Temperatures",
      readings: [
        { label: "Battery", value: first, format: f.celsius },
        { label: "Battery", value: second, format: f.celsius },
      ],
    },
    { title: "Temperatures", readings: [{ label: "Sensor", value: 30, format: f.celsius }] },
  ];
}

const page = {
  minimal: (shown: DetailGroup[]) => (
    <PartPage part="battery" title="Battery" status="good" state="Charging" groups={shown} checks={[]} />
  ),
  fof: (shown: DetailGroup[]) => (
    <Deck part="battery" title="Battery" status="good" state="Charging" groups={shown} checks={[]} />
  ),
};

describe.each(Object.entries(page))("rows sharing a label, in the %s skin", (_, draw) => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    errors.mockRestore();
  });

  it("each keep their own value across an update", () => {
    const { container, rerender } = render(draw(groups(21, 25)));
    const values = () => [...container.querySelectorAll(".reading-value")].map((value) => value.textContent);
    expect(values()).toEqual(["21.0 °C", "25.0 °C", "30.0 °C"]);
    rerender(draw(groups(null, 26)));
    expect(values()).toEqual(["26.0 °C", "30.0 °C"]);
    rerender(draw(groups(22, 27)));
    expect(values()).toEqual(["22.0 °C", "27.0 °C", "30.0 °C"]);
    expect(errors).not.toHaveBeenCalled();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import type { System } from "../model/system";
import { system } from "../test/system";
import { FofSkin } from "./fof/FofSkin";
import { MinimalSkin } from "./minimal/MinimalSkin";

// Every reading known, a generator running on the second AC input and the
// inverter/charger taking power from it, so that a reading either skin leaves
// out shows up as a difference.
const everything: System = {
  ...system,
  generator: { status: "normal", ac_input: 2, running: true, power_w: 2100, run_time_s: 1800 },
  inverter_charger: { ...system.inverter_charger!, ac_inputs: 2, active_input: 2 },
  battery: { ...system.battery!, temperature_c: 21.5, time_to_go_s: 36000 },
  solar: {
    ...system.solar!,
    chargers: system.solar!.chargers.map((charger) => ({ ...charger, status: "good", power_w: 155 })),
  },
  dc_loads: { status: "normal", power_w: 42, measured_by: "meter" },
};

const PARTS = ["Shore power", "Generator", "Inverter/charger", "Battery", "Solar", "AC loads", "DC loads"];

/** Every value a skin shows for each part, numbers and words alike, sorted. */
function shown(skin: ReactElement): Record<string, string[]> {
  render(skin);
  const values = Object.fromEntries(PARTS.map((name) => {
    const part = screen.getByRole("region", { name });
    const numbers = [...part.querySelectorAll(".reading-value")];
    const words = [...part.querySelectorAll("dd")].filter((dd) => dd.querySelector(".reading-value") === null);
    return [name, [...numbers, ...words].map((element) => element.textContent ?? "").sort()];
  }));
  cleanup();
  return values;
}

describe("the skins", () => {
  it("show the same readings for every part", () => {
    const minimal = shown(<MinimalSkin model={everything} />);
    const fof = shown(<FofSkin model={everything} />);
    expect(fof).toEqual(minimal);
    expect(minimal.Battery).toEqual(expect.arrayContaining(["10 h 0 min", "100.0 A", "150.0 A", "20 mV"]));
    expect(minimal["Inverter/charger"]).toContain("Generator");
  });
});

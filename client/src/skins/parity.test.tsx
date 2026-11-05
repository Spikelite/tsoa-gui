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
  battery: { ...system.battery!, temperature_c: 21.5, time_left: { toward: "full", seconds: 36000, settled: true } },
  solar: {
    ...system.solar!,
    chargers: system.solar!.chargers.map((charger) => ({ ...charger, status: "good", power_w: 155 })),
  },
  ac_loads: {
    ...system.ac_loads!,
    circuits: system.ac_loads!.circuits.map((circuit) => ({ ...circuit, status: "normal", power_w: 130 })),
  },
  dc_loads: { status: "normal", power_w: 42, measured_by: "meter" },
};

const PARTS = {
  "Shore power": "grid", Generator: "generator", Inverter: "inverter_charger", Battery: "battery", Solar: "solar",
  "AC loads": "ac_loads", "DC loads": "dc_loads",
};

/** Every value shown in a part, numbers and words alike, sorted. */
function valuesIn(part: HTMLElement): string[] {
  const numbers = [...part.querySelectorAll(".reading-value")];
  const words = [...part.querySelectorAll("dd")].filter((dd) => dd.querySelector(".reading-value") === null);
  return [...numbers, ...words].map((element) => element.textContent ?? "").sort();
}

/** What a skin's overview shows for each part. */
function shown(skin: ReactElement): Record<string, string[]> {
  render(skin);
  const values = Object.fromEntries(Object.keys(PARTS).map((name) => [name, valuesIn(screen.getByRole("region", { name }))]));
  cleanup();
  return values;
}

describe("the skins", () => {
  it("show the same readings for every part, Sci-Fi FOF keeping some of them to the part's own page", () => {
    const minimal = shown(<MinimalSkin model={everything} />);
    const fof = shown(<FofSkin model={everything} />);
    for (const [name, part] of Object.entries(PARTS)) {
      expect(minimal[name]).toEqual(expect.arrayContaining(fof[name]!));
      window.history.replaceState(null, "", `/?part=${part}`);
      render(<FofSkin model={everything} />);
      expect(valuesIn(screen.getByRole("region", { name }))).toEqual(expect.arrayContaining(minimal[name]!));
      cleanup();
      window.history.replaceState(null, "", "/");
    }
    expect(minimal.Battery).toEqual(expect.arrayContaining(["10 h 0 min", "100.0 A", "150.0 A", "20 mV"]));
    expect(minimal["Inverter"]).toContain("Generator");
    // Each metered circuit's power, under the AC loads.
    expect(minimal["AC loads"]).toEqual(expect.arrayContaining(["130 W"]));
  });
});

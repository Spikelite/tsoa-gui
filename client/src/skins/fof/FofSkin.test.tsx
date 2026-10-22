import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { system } from "../../test/system";
import { FofSkin } from "./FofSkin";

describe("FofSkin", () => {
  it("draws a readout for each part the system has, and none for the rest", () => {
    render(<FofSkin model={system} />);
    for (const name of ["Shore power", "Inverter/charger", "Battery", "Solar", "AC loads", "DC loads"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("region", { name: "Generator" })).not.toBeInTheDocument();
  });

  it("lists every part's status with an icon and a state in words", () => {
    render(<FofSkin model={system} />);
    const rail = screen.getByRole("list", { name: "Status" });
    const items = within(rail).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    const battery = items.find((item) => item.textContent?.startsWith("Battery"))!;
    expect(within(battery).getByRole("img", { name: "Good" })).toBeInTheDocument();
    expect(within(battery).getByText("Charging")).toBeInTheDocument();
  });

  it("fills the core to the state of charge, and pulses it upward while charging", () => {
    render(<FofSkin model={system} />);
    const core = screen.getByRole("meter", { name: "State of charge" });
    expect(core).toHaveAttribute("aria-valuenow", "64.5");
    expect(core.style.getPropertyValue("--charge")).toBe("64.5%");
    expect(core.className).toContain("fof-up");
  });

  it("stills the core when the battery is idle, and runs it downward while discharging", () => {
    const { rerender } = render(<FofSkin model={{ ...system, battery: { ...system.battery!, activity: "idle" } }} />);
    expect(screen.getByRole("meter").className).toContain("fof-still");
    rerender(<FofSkin model={{ ...system, battery: { ...system.battery!, activity: "discharging" } }} />);
    expect(screen.getByRole("meter").className).toContain("fof-down");
  });

  it("shows the output's voltage and frequency with the AC loads", () => {
    render(<FofSkin model={system} />);
    const loads = screen.getByRole("region", { name: "AC loads" });
    expect(within(loads).getByText("230.4 V")).toBeInTheDocument();
    expect(within(loads).getByText("50.01 Hz")).toBeInTheDocument();
  });

  it("draws a conduit for every path power is taking", () => {
    const { container } = render(<FofSkin model={system} />);
    const drawn = [...container.querySelectorAll("[data-flow]")].map((conduit) => conduit.getAttribute("data-flow"));
    expect(drawn).toEqual(system.flows.map((flow) => `${flow.source}-${flow.target}`));
    expect(screen.getByText(/Solar\s+to\s+Battery/)).toBeInTheDocument();
  });

  it("shows a part that is not reporting without its readings", () => {
    render(<FofSkin model={{ ...system, grid: { ...system.grid!, status: "offline" } }} />);
    const grid = screen.getByRole("region", { name: "Shore power" });
    expect(within(grid).getByText("Not reporting")).toBeInTheDocument();
    expect(within(grid).queryByText("231.5 V")).not.toBeInTheDocument();
  });
});

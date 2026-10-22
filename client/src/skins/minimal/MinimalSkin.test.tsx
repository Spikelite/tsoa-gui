import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { system } from "../../test/system";
import { flowSpeed } from "./flowSpeed";
import { MinimalSkin } from "./MinimalSkin";

function panel(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("MinimalSkin", () => {
  it("draws a panel for each part the system has, and none for the rest", () => {
    render(<MinimalSkin model={system} />);
    for (const name of ["Shore power", "Inverter/charger", "Battery", "Solar", "AC loads", "DC loads"]) {
      expect(panel(name)).toBeInTheDocument();
    }
    expect(screen.queryByRole("region", { name: "Generator" })).not.toBeInTheDocument();
  });

  it("pairs every status color with an icon and a state in words", () => {
    render(<MinimalSkin model={system} />);
    const battery = panel("Battery");
    expect(within(battery).getByRole("img", { name: "Good" })).toBeInTheDocument();
    expect(within(battery).getByText("Charging")).toBeInTheDocument();
    const inverter = panel("Inverter/charger");
    // One for its status, one beside its alarm.
    expect(within(inverter).getAllByRole("img", { name: "Warning" })).toHaveLength(2);
    expect(within(inverter).getByText("Bulk")).toBeInTheDocument();
    expect(within(inverter).getByText("High temperature")).toBeInTheDocument();
  });

  it("shows readings with their units, and an unknown one as unknown, never zero", () => {
    render(<MinimalSkin model={system} />);
    expect(within(panel("Battery")).getByText("65%")).toBeInTheDocument();
    expect(within(panel("Shore power")).getByText("1.25 kW")).toBeInTheDocument();
    expect(within(panel("DC loads")).getByText("unknown")).toBeInTheDocument();
    const loads = panel("AC loads");
    expect(within(loads).getByText("230.4 V")).toBeInTheDocument();
    expect(within(loads).getByText("3.1 A")).toBeInTheDocument();
    expect(within(loads).getByText("50.01 Hz")).toBeInTheDocument();
  });

  it("leaves out details the system does not report", () => {
    render(<MinimalSkin model={system} />);
    expect(within(panel("Battery")).queryByText("Temperature")).not.toBeInTheDocument();
    expect(within(panel("Battery")).getByText("Cell spread")).toBeInTheDocument();
  });

  it("shows a charger that is not reporting as offline", () => {
    render(<MinimalSkin model={system} />);
    const solar = panel("Solar");
    expect(within(solar).getByRole("img", { name: "Offline" })).toBeInTheDocument();
    expect(within(solar).getByText("Not reporting")).toBeInTheDocument();
  });

  it("draws every flow between the panels it connects", () => {
    const { container } = render(<MinimalSkin model={system} />);
    const drawn = [...container.querySelectorAll("[data-flow]")].map((line) => line.getAttribute("data-flow"));
    expect(drawn).toEqual(system.flows.map((flow) => `${flow.source}-${flow.target}`));
  });

  it("says a state is unknown when the reading behind it is", () => {
    render(<MinimalSkin model={{ ...system, solar: { ...system.solar!, power_w: null } }} />);
    expect(within(panel("Solar")).getByText("Unknown")).toBeInTheDocument();
  });

  it("draws an offline part without its readings", () => {
    render(<MinimalSkin model={{ ...system, battery: { ...system.battery!, status: "offline" } }} />);
    const battery = panel("Battery");
    expect(within(battery).getByText("Not reporting")).toBeInTheDocument();
    expect(within(battery).queryByText("65%")).not.toBeInTheDocument();
  });
});

describe("flowSpeed", () => {
  it("steps up with every tenfold increase in power", () => {
    expect([0, 5, 50, 500, 5000, 50000].map(flowSpeed)).toEqual([0, 0, 1, 2, 3, 4]);
  });
});

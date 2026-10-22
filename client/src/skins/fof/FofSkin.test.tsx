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

  it("shows every part's status in words on a button of its color, and its state in words", () => {
    render(<FofSkin model={system} />);
    const expected = {
      "Shore power": ["Normal", "Connected"],
      "Inverter/charger": ["Warning", "Bulk"],
      Battery: ["Good", "Charging"],
      Solar: ["Good", "Producing"],
      "AC loads": ["Normal", "In use"],
      "DC loads": ["Normal", "Calculated"],
    };
    for (const [name, [status, state]] of Object.entries(expected)) {
      const part = screen.getByRole("region", { name });
      expect(part.querySelector(".fof-status")).toHaveTextContent(status!);
      expect(within(part).getByText(state!)).toBeInTheDocument();
    }
  });

  it("lights the bank's cells to the state of charge, and runs its wave forward while charging", () => {
    const { container } = render(<FofSkin model={system} />);
    const bank = screen.getByRole("meter", { name: "State of charge" });
    expect(bank).toHaveAttribute("aria-valuenow", "64.5");
    expect(bank.className).toContain("fof-up");
    // 64.5% of ten cells is 6.45: six full and the seventh partly lit.
    const lit = [...container.querySelectorAll<HTMLElement>(".fof-cell-lit")];
    expect(lit).toHaveLength(7);
    expect(lit.map((cell) => cell.style.getPropertyValue("--level")).sort()).toEqual([
      "0.45", "1.00", "1.00", "1.00", "1.00", "1.00", "1.00",
    ]);
    expect(container.querySelectorAll(".fof-cell")).toHaveLength(10);
  });

  it("lights the battery's cells from the middle of the top row, where its conduit feeds it", () => {
    const { container, rerender } = render(<FofSkin model={{ ...system, battery: { ...system.battery!, soc_percent: 10 } }} />);
    // Cells sit top row first, left to right.
    const lit = () => [...container.querySelectorAll(".fof-cell")].flatMap((cell, place) =>
      cell.classList.contains("fof-cell-lit") ? [place] : []);
    expect(lit()).toEqual([2]);
    rerender(<FofSkin model={{ ...system, battery: { ...system.battery!, soc_percent: 60 } }} />);
    // The top row fills outward from its middle, then the bottom row starts from its own.
    expect(lit()).toEqual([0, 1, 2, 3, 4, 7]);
  });

  it("stills the bank when the battery is idle, and runs it downward while discharging", () => {
    const { rerender } = render(<FofSkin model={{ ...system, battery: { ...system.battery!, activity: "idle" } }} />);
    expect(screen.getByRole("meter").className).toContain("fof-still");
    rerender(<FofSkin model={{ ...system, battery: { ...system.battery!, activity: "discharging" } }} />);
    expect(screen.getByRole("meter").className).toContain("fof-down");
  });

  it("colors the inverter/charger's ring by what it is doing, and stills it when it is not reporting", () => {
    const inverter = system.inverter_charger!;
    const ring = (state: typeof inverter.state, status: typeof inverter.status = inverter.status) => {
      const { container, unmount } = render(<FofSkin model={{ ...system, inverter_charger: { ...inverter, state, status } }} />);
      const unit = container.querySelector(".fof-unit")!.className;
      unmount();
      return unit;
    };
    expect(ring("bulk")).toContain("fof-duty-charging");
    expect(ring("inverting")).toContain("fof-duty-inverting");
    expect(ring("passthrough")).toContain("fof-duty-passing");
    expect(ring("off")).toContain("fof-duty-idle");
    expect(ring("inverting", "offline")).toContain("fof-duty-idle");
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
    // Shore power to the AC loads is drawn through the inverter/charger's hub, with the rest.
    expect(drawn).toEqual(["grid-inverter_charger", "inverter_charger-ac_loads", "inverter_charger-battery", "solar-battery"]);
  });

  it("shows a part that is not reporting without its readings", () => {
    render(<FofSkin model={{ ...system, grid: { ...system.grid!, status: "offline" } }} />);
    const grid = screen.getByRole("region", { name: "Shore power" });
    expect(within(grid).getByText("Not reporting")).toBeInTheDocument();
    expect(within(grid).queryByText("231.5 V")).not.toBeInTheDocument();
  });
});

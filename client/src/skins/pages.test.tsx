import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { system } from "../test/system";
import { cellDetails } from "./details";
import { FofSkin } from "./fof/FofSkin";
import { MinimalSkin } from "./minimal/MinimalSkin";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

/** Every value a part's page shows, numbers and words alike, once each. */
function shownOnPage(skin: ReactElement): string[] {
  window.history.replaceState(null, "", "/?part=battery");
  render(skin);
  const page = screen.getByRole("region", { name: "Battery" });
  const numbers = [...page.querySelectorAll(".reading-value")];
  const words = [...page.querySelectorAll("dd")].filter((dd) => dd.querySelector(".reading-value") === null);
  const values = [...new Set([...numbers, ...words].map((element) => element.textContent ?? ""))].sort();
  cleanup();
  return values;
}

describe("a part's own page", () => {
  it("shows the same battery detail in every skin", () => {
    const minimal = shownOnPage(<MinimalSkin model={system} />);
    const fof = shownOnPage(<FofSkin model={system} />);
    expect(fof).toEqual(minimal);
    // Every cell, its difference from the others, and the history and limits.
    expect(minimal).toEqual(expect.arrayContaining(["3.290 V", "3.310 V", "-11 mV", "18", "28.2 V", "Allowed"]));
    expect(minimal).toEqual(expect.arrayContaining(["Cell voltage", "Example Cells", "129.0 Ah"]));
  });

  it("lists every condition the battery watches, alarming ones first, in every skin", () => {
    for (const skin of [<MinimalSkin model={system} />, <FofSkin model={system} />]) {
      window.history.replaceState(null, "", "/?part=battery");
      render(skin);
      const alarms = screen.getByRole("region", { name: "Battery" }).querySelectorAll(".checks li, .fof-deck-checks li");
      expect([...alarms].map((item) => item.textContent)).toEqual([
        expect.stringContaining("Cell imbalance"), expect.stringContaining("High cell voltage"),
        expect.stringContaining("Low temperature"),
      ]);
      cleanup();
    }
  });

  it("opens from the overview and closes again, from the page's own control or Escape", async () => {
    for (const [skin, back] of [[MinimalSkin, "Overview"], [FofSkin, "Overview"]] as const) {
      const Skin = skin;
      render(<Skin model={system} />);
      expect(screen.queryByRole("list", { name: "Cells" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("link", { name: "Battery" }));
      expect(window.location.search).toBe("?part=battery");
      expect(screen.getByRole("list", { name: "Cells" })).toBeInTheDocument();
      // Closing goes back over the step opening took in the browser's history.
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("list", { name: "Cells" })).not.toBeInTheDocument());
      expect(window.location.search).toBe("");

      fireEvent.click(screen.getByRole("link", { name: "Battery" }));
      fireEvent.click(screen.getByRole("button", { name: back }));
      await waitFor(() => expect(screen.queryByRole("list", { name: "Cells" })).not.toBeInTheDocument());
      cleanup();
      window.history.replaceState(null, "", "/");
    }
  });

  it("opens straight onto a page from the address, as a kiosk does", () => {
    window.history.replaceState(null, "", "/?skin=sci-fi-fof&part=battery");
    render(<FofSkin model={system} />);
    expect(within(screen.getByRole("list", { name: "Cells" })).getAllByRole("listitem")).toHaveLength(8);
  });

  it("ignores a part with no page, or one the system lacks", () => {
    window.history.replaceState(null, "", "/?part=solar");
    render(<MinimalSkin model={system} />);
    expect(screen.getByRole("region", { name: "Solar" })).toBeInTheDocument();
    cleanup();
    window.history.replaceState(null, "", "/?part=battery");
    render(<MinimalSkin model={{ ...system, battery: null }} />);
    expect(screen.queryByRole("list", { name: "Cells" })).not.toBeInTheDocument();
  });
});

describe("cellDetails", () => {
  it("marks the lowest and highest cells and fills each between empty and full", () => {
    const cells = cellDetails(system.battery!.cells, system.battery!);
    expect(cells.filter((cell) => cell.lowest).map((cell) => cell.number)).toEqual([3]);
    expect(cells.filter((cell) => cell.highest).map((cell) => cell.number)).toEqual([4]);
    // Empty at 24 V over eight cells is 3 V a cell, full at 3.55 V.
    expect(cells[0]!.level).toBeCloseTo(0.3 / 0.55);
  });

  it("marks neither when every cell reads the same", () => {
    const cells = cellDetails([{ voltage_v: 3.3, balancing: false }, { voltage_v: 3.3, balancing: false }]);
    expect(cells.some((cell) => cell.lowest || cell.highest)).toBe(false);
    expect(cells[0]!.level).toBeNull();
  });
});

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { system } from "../../test/system";
import { FofSkin } from "./FofSkin";

describe("FofSkin", () => {
  it("draws a readout for each part the system has, and none for the rest", () => {
    render(<FofSkin model={system} />);
    for (const name of ["Shore power", "Inverter", "Battery", "Solar", "AC loads", "DC loads"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("region", { name: "Generator" })).not.toBeInTheDocument();
  });

  it("colors every part's name by its status, says the status in words, and its state", () => {
    render(<FofSkin model={system} />);
    const expected = {
      "Shore power": ["Normal", "Connected"],
      "Inverter": ["Warning", "Bulk"],
      Battery: ["Good", "Charging"],
      Solar: ["Good", "Producing"],
      "AC loads": ["Normal", "In use"],
      "DC loads": ["Normal", "Calculated"],
    };
    for (const [name, [status, state]] of Object.entries(expected)) {
      const part = screen.getByRole("region", { name });
      expect(part.querySelector(".fof-label-block")).toHaveTextContent(status!);
      expect(part).toHaveClass(`status-${status!.toLowerCase()}`);
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

  it("writes a status that needs attention after the part's name, and only reads out one that does not", () => {
    const { container } = render(<FofSkin model={{ ...system, battery: { ...system.battery!, status: "warning" } }} />);
    const name = (part: string) => screen.getByRole("region", { name: part }).querySelector(".fof-label-block")!;
    expect(name("Battery").querySelector(".fof-status-words")).toHaveTextContent(/^Warning$/);
    expect(name("Solar").querySelector(".fof-quiet")).toHaveTextContent(/^, Good$/);
    expect(container.querySelector(".fof-status-words")?.textContent).not.toContain(",");
  });

  it("stills the bank when the battery is idle, and runs it downward once it is discharging", () => {
    // The skin's changes keep to the page's clock, which is performance's.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const { rerender } = render(<FofSkin model={{ ...system, battery: { ...system.battery!, activity: "idle" } }} />);
      expect(screen.getByRole("meter").className).toContain("fof-still");
      rerender(<FofSkin model={{ ...system, battery: { ...system.battery!, activity: "discharging" } }} />);
      // Not at once, but as the cycle that would send a wave from it starts.
      expect(screen.getByRole("meter").className).toContain("fof-still");
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.getByRole("meter").className).toContain("fof-down");
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries a conduit's change to idle along it with its waves, not at once", () => {
    // The skin's changes keep to the page's clock, which is performance's.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const { container, rerender } = render(<FofSkin model={system} />);
      const solar = () => container.querySelector("[data-flow='solar-dc_bus']")!;
      act(() => vi.advanceTimersByTime(0));
      expect(solar().getAttribute("class")).not.toMatch(/fof-conduit-(idle|carrying)/);
      rerender(<FofSkin model={{ ...system, flows: system.flows.filter((flow) => flow.source !== "solar") }} />);
      act(() => vi.advanceTimersByTime(0));
      // Dim, with what is still active on it drawn over it and its waves still rolling.
      expect(solar()).toHaveClass("fof-conduit-carrying");
      expect(solar().querySelector(".fof-conduit-carried")).not.toBeNull();
      expect(solar().querySelectorAll(".fof-conduit-wave").length).toBeGreaterThan(0);
      // React draws again between steps, and each draw times the next.
      for (let step = 0; step < 30; step++) {
        act(() => vi.advanceTimersByTime(2_000));
      }
      expect(solar()).toHaveClass("fof-conduit-idle");
      expect(solar()).not.toHaveClass("fof-conduit-carrying");
      expect(solar().querySelector(".fof-conduit-wave")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("colors the inverter/charger's ring by what it is doing, and stills it when it is not reporting", () => {
    const inverter = system.inverter_charger!;
    const ring = (state: typeof inverter.state, status: typeof inverter.status = inverter.status) => {
      const { container, unmount } = render(<FofSkin model={{ ...system, inverter_charger: { ...inverter, state, status } }} />);
      const unit = container.querySelector(".fof-ring-unit")!.className;
      unmount();
      return unit;
    };
    expect(ring("bulk")).toContain("fof-duty-charging");
    expect(ring("inverting")).toContain("fof-duty-inverting");
    expect(ring("passthrough")).toContain("fof-duty-passing");
    expect(ring("off")).toContain("fof-duty-idle");
    expect(ring("inverting", "offline")).toContain("fof-duty-idle");
  });

  it("leads a part with one figure on the overview and leaves the rest to its page", () => {
    render(<FofSkin model={system} />);
    const shore = screen.getByRole("region", { name: "Shore power" });
    expect(shore.querySelector(".fof-headline")).toHaveTextContent("Power1.25 kW");
    expect(shore.querySelector(".fof-headline dt")).toHaveClass("fof-quiet");
    expect(within(shore).queryByText("231.5 V")).toBeNull();
    expect(within(shore).getByText("16.0 A")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "AC loads" })).queryByText("230.4 V")).toBeNull();
    cleanup();

    window.history.replaceState(null, "", "/?part=ac_loads");
    render(<FofSkin model={system} />);
    const page = screen.getByRole("region", { name: "AC loads" });
    expect(within(page).getAllByText("230.4 V").length).toBeGreaterThan(0);
    expect(within(page).getAllByText("50.01 Hz").length).toBeGreaterThan(0);
    window.history.replaceState(null, "", "/");
  });

  it("carries the figures that say how the system is doing on the top bar", () => {
    const charging = {
      ...system, inverter_charger: { ...system.inverter_charger!, status: "normal" as const, alarms: [] },
      battery: { ...system.battery!, soc_percent: 70, power_w: 300 },
    };
    const { rerender } = render(<FofSkin model={charging} />);
    const vitals = () => [...document.querySelectorAll(".fof-vital")].map((vital) => vital.textContent);
    expect(vitals()).toEqual(["70%Battery, Charging", "300 WInto the battery", "310 WSolar", "900 WLoads"]);

    rerender(<FofSkin model={{ ...charging, battery: { ...charging.battery, power_w: -300 } }} />);
    expect(vitals()).toContain("300 WOut of the battery");

    // Only what the system has, and what it knows.
    rerender(<FofSkin model={{ ...charging, solar: null, battery: { ...charging.battery, power_w: null } }} />);
    expect(vitals()).toEqual(["70%Battery, Charging", "900 WLoads"]);
  });

  it("lets the worst alarm take over the top bar, with each part's block saying its own", () => {
    const fault = {
      ...system,
      inverter_charger: { ...system.inverter_charger!, status: "fault" as const, alarms: [{ name: "Overload", level: "alarm" as const }] },
      battery: { ...system.battery!, status: "attention" as const },
    };
    render(<FofSkin model={fault} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("status-fault");
    expect(alert).toHaveTextContent("Inverter FaultOverload");
    expect(document.querySelector(".fof-vital")).toBeNull();

    const parts = within(screen.getByRole("navigation", { name: "Parts" }));
    expect(parts.getByRole("link", { name: /Inverter/ })).toHaveTextContent("OverloadInverter");
    expect(parts.getByRole("link", { name: /Inverter/ })).toHaveClass("status-fault");
    // A raised check is the battery's word for what is wrong.
    expect(parts.getByRole("link", { name: /Battery/ })).toHaveTextContent("Cell imbalanceBattery");
    expect(parts.getByRole("link", { name: /Battery/ })).toHaveClass("status-attention");
    expect(parts.getByRole("link", { name: "Solar" })).not.toHaveClass("fof-side-raised");
    // Said on the frame and the name, so not again among the readings.
    expect(within(screen.getByRole("region", { name: /Inverter/ })).queryByText("Overload")).toBeNull();
  });

  it("stops and dims everything inside the frame while the readings are not live", () => {
    const { container, rerender } = render(<FofSkin model={{ ...system, live: false }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("StaleNot hearing from the device");
    expect(container.querySelector(".fof")).toHaveClass("fof-frozen-stale");

    rerender(<FofSkin model={system} connected={false} />);
    expect(screen.getByRole("alert")).toHaveClass("status-fault");
    expect(screen.getByRole("alert")).toHaveTextContent("OfflineLost the server");
    expect(container.querySelector(".fof")).toHaveClass("fof-frozen-lost");

    const calm = { ...system, inverter_charger: { ...system.inverter_charger!, status: "normal" as const, alarms: [] } };
    rerender(<FofSkin model={calm} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector(".fof")).not.toHaveClass("fof-frozen");
  });

  it("names a part's page on the top bar, with that part's own figures", () => {
    const calm = {
      ...system, inverter_charger: { ...system.inverter_charger!, status: "normal" as const, alarms: [] },
      battery: { ...system.battery!, soc_percent: 70, power_w: 300, time_left: { toward: "full" as const, seconds: 5760, settled: true } },
    };
    window.history.replaceState(null, "", "/?part=battery");
    const { rerender } = render(<FofSkin model={calm} />);
    const bar = () => [document.querySelector(".fof-label"), ...document.querySelectorAll(".fof-vital")].map((segment) => segment?.textContent);
    expect(bar()).toEqual(["Battery", "70%Charging", "300 WInto the battery", "1 h 36 minTime to full"]);
    // A time ends in a unit, whose case means something; a word is set in capitals.
    const figures = () => [...document.querySelectorAll(".fof-vital b")];
    expect(figures()[2]).not.toHaveClass("fof-word");

    window.history.replaceState(null, "", "/?part=inverter_charger");
    window.dispatchEvent(new PopStateEvent("popstate"));
    rerender(<FofSkin model={calm} />);
    expect(bar()).toEqual(["Inverter", "700 WAC out", "BulkState", "OnMode"]);
    expect(figures()[1]).toHaveClass("fof-word");
    window.history.replaceState(null, "", "/");
  });

  it("leaves a part that is not reporting off the top bar", () => {
    // With no alarm, which would take the bar's place whatever the part was doing.
    const calm = { ...system, inverter_charger: { ...system.inverter_charger!, status: "normal" as const, alarms: [] } };
    window.history.replaceState(null, "", "/?part=battery");
    const { rerender } = render(<FofSkin model={calm} />);
    expect(document.querySelectorAll(".fof-vital-part").length).toBeGreaterThan(0);
    rerender(<FofSkin model={{ ...calm, battery: { ...calm.battery!, status: "offline" } }} />);
    expect(document.querySelectorAll(".fof-vital-part")).toHaveLength(0);
    window.history.replaceState(null, "", "/");
  });

  describe("the battery's cells", () => {
    const withCells = (volts: (number | null)[]) => ({
      ...system,
      battery: { ...system.battery!, cells: volts.map((voltage_v) => ({ voltage_v, balancing: false })) },
    });
    const cells = () => within(screen.getByRole("list", { name: "Cells" })).getAllByRole("listitem");
    const distance = (cell: HTMLElement) => cell.style.getPropertyValue("--distance");

    beforeEach(() => window.history.replaceState(null, "", "/?part=battery"));
    afterEach(() => window.history.replaceState(null, "", "/"));

    it("draws each cell's distance from the mean, up or down from it, with the widest at full height", () => {
      render(<FofSkin model={system} />);
      const [first, , third, fourth] = cells();
      expect(distance(third!)).toBe("1.000");
      expect(third!.querySelector(".fof-deck-offset")).toHaveClass("fof-deck-offset-under");
      expect(distance(fourth!)).toBe("0.778");
      expect(fourth!.querySelector(".fof-deck-offset")).toHaveClass("fof-deck-offset-over");
      expect(distance(first!)).toBe("0.111");
      expect(third).toHaveTextContent("-11 mV");
    });

    it("does not make cells a millivolt apart look as if they have drifted", () => {
      render(<FofSkin model={withCells([3.25, 3.251, 3.25, 3.251])} />);
      expect(cells().map(distance)).toEqual(["0.100", "0.100", "0.100", "0.100"]);
    });

    it("names the lowest and the highest, and which is being balanced", () => {
      render(<FofSkin model={system} />);
      const [, , third, fourth, fifth] = cells();
      expect(third!.querySelector(".fof-deck-name")).toHaveTextContent(/^Cell 3, lowest$/);
      expect(fourth!.querySelector(".fof-deck-name")).toHaveTextContent(/^Cell 4, highest, balancing$/);
      expect(fifth!.querySelector(".fof-deck-name")).toHaveTextContent(/^Cell 5$/);
    });

    it("draws no bar for a cell with no voltage", () => {
      render(<FofSkin model={withCells([3.25, null, 3.26])} />);
      const [first, second] = cells();
      expect(first!.querySelector(".fof-deck-offset i")).not.toBeNull();
      expect(second!.querySelector(".fof-deck-offset i")).toBeNull();
    });

    it("puts more than 16 cells on a second row, at the same scale as the first", () => {
      const { container } = render(<FofSkin model={withCells([...Array<number>(16).fill(3.3), 3.4])} />);
      expect([...container.querySelectorAll(".fof-deck-pack")].map((row) => row.querySelectorAll(".fof-deck-cell").length))
        .toEqual([9, 8]);
      expect(Number(distance(cells()[0]!))).toBeCloseTo(1 / 16, 2);
      expect(distance(cells()[16]!)).toBe("1.000");
    });

    it("leaves the block out for a battery that reports no cells", () => {
      const { container } = render(<FofSkin model={withCells([])} />);
      expect(screen.queryByRole("list", { name: "Cells" })).toBeNull();
      expect(container.querySelector(".fof-deck-pack")).toBeNull();
    });
  });

  describe("the load and supply pages", () => {
    const run = () => document.querySelector(".fof-conduit-run");
    const page = (part: string) => window.history.replaceState(null, "", `/?part=${part}`);
    afterEach(() => window.history.replaceState(null, "", "/"));

    it("says where an AC panel's power goes, with what no meter accounts for", () => {
      page("ac_loads");
      render(<FofSkin model={system} />);
      const shares = within(screen.getByRole("region", { name: "Where the power goes" })).getAllByRole("listitem");
      expect(shares.map((share) => share.textContent)).toEqual(["Kitchen 420 W", "Not metered 480 W"]);
      expect(shares[1]).toHaveClass("fof-deck-share-rest");
    });

    it("says nothing of where the power goes on a panel with no circuits", () => {
      page("ac_loads");
      render(<FofSkin model={{ ...system, ac_loads: { ...system.ac_loads!, circuits: [] } }} />);
      expect(screen.queryByRole("region", { name: "Where the power goes" })).toBeNull();
    });

    it("draws the bus with all the power reaching the panel, however many ways it comes", () => {
      page("ac_loads");
      render(<FofSkin model={system} />);
      expect(run()!.parentElement).toHaveClass("fof-panel-bus");
      // 900 W, from the inverter and the supply side together.
      expect(run()!.querySelector(".fof-conduit")).toHaveClass("fof-speed-2");
      expect(run()!.querySelector(".fof-conduit")).not.toHaveClass("fof-conduit-idle");
      expect(run()!.querySelectorAll(".fof-conduit-wave").length).toBeGreaterThan(0);
    });

    it("draws a supply's conduit leaving its pips, dim and still with nothing on it", () => {
      page("solar");
      render(<FofSkin model={{ ...system, flows: [] }} />);
      expect(run()!.parentElement).toHaveClass("fof-schematic-launch");
      expect(run()!.querySelector(".fof-conduit")).toHaveClass("fof-conduit-idle");
      expect(run()!.querySelector(".fof-conduit-wave")).toBeNull();
    });

    it("runs a supply's conduit back to it while power goes the other way", () => {
      page("grid");
      const { rerender } = render(<FofSkin model={system} />);
      const start = () => Number(/^M([\d.]+),/.exec(run()!.querySelector(".fof-conduit-body")!.getAttribute("d")!)![1]);
      expect(start()).toBe(0);
      rerender(<FofSkin model={{ ...system, flows: [{ source: "inverter_charger", target: "grid", power_w: 400 }] }} />);
      expect(start()).toBeGreaterThan(0);
    });

    it("gives the drawing the pace of its conduit, which the overview would have given it", () => {
      page("solar");
      const { container } = render(<FofSkin model={system} />);
      const art = container.querySelector<HTMLElement>(".fof-deck-art")!;
      expect(art.style.getPropertyValue("--fof-roll-solar-dc_bus")).toBe(run()!.getAttribute("style")!.match(/--fof-roll: ([\d.]+s)/)![1]);
    });
  });

  it("shows each front panel light as lit, blinking or dark, and says which", () => {
    window.history.replaceState(null, "", "/?part=inverter_charger");
    render(<FofSkin model={system} />);
    const lights = within(screen.getByRole("list", { name: "Front panel lights" })).getAllByRole("listitem");
    expect(lights.map((light) => light.textContent)).toEqual(["Mains, on", "Bulk, blinking", "Inverter, off"]);
    expect(lights.map((light) => light.className.split(" ").at(-1)))
      .toEqual(["fof-deck-led-on", "fof-deck-led-blinking", "fof-deck-led-off"]);
    window.history.replaceState(null, "", "/");
  });

  it("colors a section by what it holds, not by where it falls on the page", () => {
    window.history.replaceState(null, "", "/?part=battery");
    render(<FofSkin model={system} />);
    const head = (name: string) => screen.getByRole("heading", { name });
    expect(head("Charge")).toHaveClass("fof-tone-sand");
    expect(head("Limits")).toHaveClass("fof-tone-sand");
    expect(head("History")).toHaveClass("fof-tone-lavender");
    expect(head("Device")).toHaveClass("fof-tone-teal");
    window.history.replaceState(null, "", "/");
  });

  it("quiets the figure of a part doing nothing", () => {
    const idle = { ...system, grid: { ...system.grid!, power_w: 0 }, dc_loads: { ...system.dc_loads!, power_w: null } };
    render(<FofSkin model={idle} />);
    const headline = (name: string) => screen.getByRole("region", { name }).querySelector(".fof-headline");
    expect(headline("Shore power")).toHaveClass("fof-headline-idle");
    expect(headline("DC loads")).toHaveClass("fof-headline-idle");
    expect(headline("AC loads")).not.toHaveClass("fof-headline-idle");
  });

  it("draws a conduit for every path power is taking", () => {
    const { container } = render(<FofSkin model={system} />);
    const drawn = [...container.querySelectorAll("[data-flow]")].map((conduit) => conduit.getAttribute("data-flow"));
    // Shore power to the AC loads is drawn through the inverter/charger's hub, with the rest; the
    // DC side meets at the DC bus; and the DC loads, which take nothing just now, are still joined
    // to it, by an idle conduit.
    expect(drawn).toEqual([
      "grid-inverter_charger", "inverter_charger-ac_loads", "inverter_charger-dc_bus", "solar-dc_bus",
      "dc_bus-battery", "dc_bus-dc_loads",
    ]);
    expect(container.querySelector("[data-flow='dc_bus-dc_loads']")).toHaveClass("fof-conduit-idle");
  });

  it("changes a conduit at once where the screen asks for reduced motion", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    try {
      const { container, rerender } = render(<FofSkin model={system} />);
      act(() => vi.advanceTimersByTime(0));
      rerender(<FofSkin model={{ ...system, flows: system.flows.filter((flow) => flow.source !== "solar") }} />);
      act(() => vi.advanceTimersByTime(0));
      expect(container.querySelector("[data-flow='solar-dc_bus']")).toHaveClass("fof-conduit-idle");
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("shows a part that is not reporting without its readings", () => {
    render(<FofSkin model={{ ...system, grid: { ...system.grid!, status: "offline" } }} />);
    const grid = screen.getByRole("region", { name: "Shore power" });
    expect(within(grid).getByText("Not reporting")).toBeInTheDocument();
    expect(within(grid).queryByText("231.5 V")).not.toBeInTheDocument();
  });
});

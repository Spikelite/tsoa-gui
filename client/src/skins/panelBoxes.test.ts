import { describe, expect, it } from "vitest";

import { conduitPath, flowPoints } from "./panelBoxes";

function middleOf(points: string) {
  const [x, y] = points.split(" ")[1]!.split(",").map(Number);
  return { x, y };
}

describe("flowPoints", () => {
  it("runs from center to center", () => {
    const points = flowPoints({ x: 0, y: 0, halfWidth: 50, halfHeight: 20 }, { x: 300, y: 0, halfWidth: 50, halfHeight: 20 });
    expect(points.startsWith("0,0 ")).toBe(true);
    expect(points.endsWith(" 300,0")).toBe(true);
  });

  it("puts the middle point halfway along the gap between the panels' edges", () => {
    const small = { x: 0, y: 0, halfWidth: 10, halfHeight: 10 };
    const tall = { x: 0, y: 300, halfWidth: 100, halfHeight: 200 };
    // Halfway between the centers (y 150) would be under the tall panel, whose top edge is at y 100.
    expect(middleOf(flowPoints(small, tall))).toEqual({ x: 0, y: 55 });
    expect(middleOf(flowPoints(tall, small))).toEqual({ x: 0, y: 55 });
  });

  it("leaves a box through the side it faces", () => {
    const left = { x: 0, y: 0, halfWidth: 40, halfHeight: 40 };
    const right = { x: 200, y: 100, halfWidth: 40, halfHeight: 40 };
    const middle = middleOf(flowPoints(left, right));
    expect(middle.x).toBeCloseTo(100);
    expect(middle.y).toBeCloseTo(50);
  });
});

describe("conduitPath", () => {
  const left = { x: 0, y: 0, halfWidth: 50, halfHeight: 20 };

  it("runs straight between panels in line, ending flush with each", () => {
    const { d, middle, angle } = conduitPath(left, { x: 300, y: 0, halfWidth: 50, halfHeight: 20 }, 28);
    // The facing edges are at x 50 and 250.
    expect(d).toBe("M50,0 L250,0");
    expect(middle).toEqual({ x: 150, y: 0 });
    expect(angle).toBe(0);
  });

  it("turns in the middle of the gap between columns, with rounded elbows", () => {
    const { d, middle, angle } = conduitPath(left, { x: 300, y: 100, halfWidth: 50, halfHeight: 20 }, 28);
    expect(d).toBe("M50,0 L122,0 Q150,0 150,28 L150,72 Q150,100 178,100 L250,100");
    expect(middle).toEqual({ x: 150, y: 50 });
    expect(angle).toBe(90);
  });

  it("runs the other way when the power does", () => {
    const { d, angle } = conduitPath({ x: 300, y: 100, halfWidth: 50, halfHeight: 20 }, left, 28);
    expect(d).toBe("M250,100 L178,100 Q150,100 150,72 L150,28 Q150,0 122,0 L50,0");
    expect(angle).toBe(270);
  });

  it("runs down the gap between rows when one panel is above the other", () => {
    const top = { x: 0, y: 0, halfWidth: 100, halfHeight: 40 };
    const bottom = { x: 150, y: 300, halfWidth: 100, halfHeight: 40 };
    const { d, middle, angle } = conduitPath(top, bottom, 28);
    expect(d).toBe("M0,40 L0,122 Q0,150 28,150 L122,150 Q150,150 150,178 L150,260");
    expect(middle).toEqual({ x: 75, y: 150 });
    expect(angle).toBe(0);
  });

  it("runs straight through the stretch two nearly level panels share, rather than jogging", () => {
    const top = { x: 0, y: 0, halfWidth: 100, halfHeight: 40 };
    const bottom = { x: 20, y: 300, halfWidth: 100, halfHeight: 40 };
    // They share x -80 to 100, so it runs at x 10.
    expect(conduitPath(top, bottom, 28).d).toBe("M10,40 L10,260");
    const beside = { x: 300, y: 12, halfWidth: 50, halfHeight: 20 };
    expect(conduitPath(left, beside, 28).d).toBe("M50,6 L250,6");
  });

  it("plugs into the graphic a panel marks, turning in the gap between the panels", () => {
    // A small label at the top left of a wide panel, and a panel to its right.
    const label = { x: 40, y: 10, halfWidth: 40, halfHeight: 10, panel: { x: 150, y: 60, halfWidth: 150, halfHeight: 60 } };
    const right = { x: 500, y: 100, halfWidth: 50, halfHeight: 20 };
    // The gap runs from x 300 to 450, so it turns at 375, past the first panel's readings.
    expect(conduitPath(label, right, 28).d).toBe("M80,10 L347,10 Q375,10 375,38 L375,72 Q375,100 403,100 L450,100");
  });

  it("leaves a panel's edge, not its name, when running down a column", () => {
    const top = { x: 40, y: 10, halfWidth: 40, halfHeight: 10, panel: { x: 100, y: 50, halfWidth: 100, halfHeight: 50 } };
    const below = { x: 100, y: 250, halfWidth: 100, halfHeight: 50 };
    // It starts at the upper panel's bottom edge (y 100), below its readings, under its name.
    expect(conduitPath(top, below, 28).d).toBe("M40,100 L40,122 Q40,150 68,150 L72,150 Q100,150 100,178 L100,200");
  });

  it("runs on into a hub, to its center", () => {
    const hub = { x: 300, y: 100, halfWidth: 40, halfHeight: 40, hub: true,
      panel: { x: 300, y: 60, halfWidth: 100, halfHeight: 80 } };
    // Across, it reaches the hub's center rather than its edge.
    expect(conduitPath(left, hub, 28).d.endsWith(" L300,100")).toBe(true);
    // Below the hub, which sits at its panel's bottom, it leaves from the center too.
    const below = { x: 300, y: 300, halfWidth: 50, halfHeight: 20 };
    expect(conduitPath(hub, below, 28).d).toBe("M300,100 L300,280");
    // Nearly level with something beside it, it still leaves through the port at the hub's center.
    const beside = { x: 600, y: 90, halfWidth: 40, halfHeight: 10, panel: { x: 650, y: 140, halfWidth: 90, halfHeight: 60 } };
    expect(conduitPath(hub, beside, 28).d.startsWith("M300,100 L")).toBe(true);
  });

  it("runs straight out of a hub's port to anything level with it", () => {
    const hub = { x: 300, y: 100, halfWidth: 40, halfHeight: 40, hub: true,
      panel: { x: 300, y: 60, halfWidth: 100, halfHeight: 80 } };
    // Well off the battery block's center, but over it: straight down, onto its top.
    const block = { x: 360, y: 300, halfWidth: 120, halfHeight: 30, open: true,
      panel: { x: 340, y: 320, halfWidth: 140, halfHeight: 60 } };
    expect(conduitPath(hub, block, 28).d).toBe("M300,100 L300,270");
  });

  it("plugs into a panel's name when the name is in its way down a column", () => {
    const hub = { x: 300, y: 100, halfWidth: 40, halfHeight: 40, hub: true,
      panel: { x: 300, y: 60, halfWidth: 100, halfHeight: 80 } };
    const block = { x: 300, y: 300, halfWidth: 120, halfHeight: 30, open: true,
      panel: { x: 300, y: 320, halfWidth: 140, halfHeight: 60 },
      label: { x: 280, y: 255, halfWidth: 60, halfHeight: 12 } };
    // The name spans x 220 to 340, under the hub, so the conduit ends on its top at y 243.
    expect(conduitPath(hub, block, 28).d).toBe("M300,100 L300,243");
  });

  it("runs on along a bus to its far end", () => {
    const hub = { x: 100, y: 100, halfWidth: 40, halfHeight: 40, hub: true,
      panel: { x: 100, y: 60, halfWidth: 100, halfHeight: 80 } };
    const bus = { x: 400, y: 100, halfWidth: 90, halfHeight: 0, bus: true,
      panel: { x: 420, y: 60, halfWidth: 110, halfHeight: 80 } };
    // From the hub's center straight along the bus to its end at x 490.
    expect(conduitPath(hub, bus, 28).d).toBe("M100,100 L490,100");
  });
});

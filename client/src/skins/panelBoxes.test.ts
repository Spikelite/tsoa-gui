import { describe, expect, it } from "vitest";

import { conduitPath, flowPoints, lanes } from "./panelBoxes";

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

/** A path's length, of its straight runs and its quadratic curves, by many short steps. */
function measured(d: string): number {
  const numbers = (text: string) => text.trim().split(/[\s,]+/).map(Number);
  let length = 0;
  let at = [0, 0];
  for (const [, command, args] of d.matchAll(/([MLQ])([^MLQ]*)/g)) {
    const n = numbers(args!);
    if (command === "M") {
      at = [n[0]!, n[1]!];
    } else if (command === "L") {
      length += Math.hypot(n[0]! - at[0]!, n[1]! - at[1]!);
      at = [n[0]!, n[1]!];
    } else {
      let last = at;
      for (let step = 1; step <= 1000; step++) {
        const s = step / 1000;
        const r = 1 - s;
        const point = [r * r * at[0]! + 2 * r * s * n[0]! + s * s * n[2]!, r * r * at[1]! + 2 * r * s * n[1]! + s * s * n[3]!];
        length += Math.hypot(point[0]! - last[0]!, point[1]! - last[1]!);
        last = point;
      }
      at = [n[2]!, n[3]!];
    }
  }
  return length;
}

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

  it("turns in its lane when it has one, with its marker there too", () => {
    const { d, middle, length } = conduitPath(left, { x: 300, y: 100, halfWidth: 50, halfHeight: 20 }, 28, 20);
    expect(d).toBe("M50,0 L142,0 Q170,0 170,28 L170,72 Q170,100 198,100 L250,100");
    expect(middle).toEqual({ x: 170, y: 50 });
    // A lane moves the upright run and leaves the length alone, which the waves are timed by.
    expect(length).toBeCloseTo(conduitPath(left, { x: 300, y: 100, halfWidth: 50, halfHeight: 20 }, 28).length);
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

  it("measures its length along the bends", () => {
    expect(conduitPath(left, { x: 300, y: 0, halfWidth: 50, halfHeight: 20 }, 28).length).toBe(200);
    // 200 across and 100 down, less the corners the two elbows cut.
    const bent = conduitPath(left, { x: 300, y: 100, halfWidth: 50, halfHeight: 20 }, 28);
    expect(bent.length).toBeCloseTo(278.9, 1);
    // As long as its path really is: the straight runs and the two curves, measured finely.
    expect(bent.length).toBeCloseTo(measured(bent.d), 1);
  });

  it("runs straight down from a hub's center even when its readings lie below it", () => {
    // The hub sits high in its panel, with readings below and to the right of it.
    const hub = { x: 300, y: 100, halfWidth: 40, halfHeight: 40, hub: true,
      panel: { x: 300, y: 140, halfWidth: 150, halfHeight: 120 } };
    const below = { x: 300, y: 400, halfWidth: 50, halfHeight: 20 };
    expect(conduitPath(hub, below, 28).d).toBe("M300,100 L300,380");
  });

  it("leaves an open graphic's panel from its bottom edge when the readings lie below it", () => {
    // A block open from above, with its readings below it in its panel.
    const block = { x: 300, y: 100, halfWidth: 120, halfHeight: 30, open: true,
      panel: { x: 300, y: 160, halfWidth: 140, halfHeight: 90 } };
    const below = { x: 300, y: 400, halfWidth: 50, halfHeight: 20 };
    expect(conduitPath(block, below, 28).d).toBe("M300,250 L300,380");
  });

  it("leaves a panel's bottom edge going down, even under its name", () => {
    const block = { x: 300, y: 100, halfWidth: 120, halfHeight: 30, open: true,
      panel: { x: 300, y: 160, halfWidth: 140, halfHeight: 90 },
      label: { x: 280, y: 60, halfWidth: 60, halfHeight: 10 } };
    const below = { x: 290, y: 400, halfWidth: 50, halfHeight: 20 };
    expect(conduitPath(block, below, 28).d.startsWith("M")).toBe(true);
    expect(conduitPath(block, below, 28).d).toContain(",250 ");
  });

  it("meets a launching row and a hub each at its own level, bending between them", () => {
    const row = { x: 100, y: 88, halfWidth: 60, halfHeight: 17, launch: true,
      panel: { x: 100, y: 60, halfWidth: 100, halfHeight: 60 } };
    const hub = { x: 500, y: 100, halfWidth: 40, halfHeight: 40, hub: true,
      panel: { x: 500, y: 100, halfWidth: 120, halfHeight: 80 } };
    const { d } = conduitPath(row, hub, 28);
    expect(d.startsWith("M160,88 ")).toBe(true);
    expect(d.endsWith(" L500,100")).toBe(true);
  });
});

describe("lanes", () => {
  const RADIUS = 28;
  const APART = 40;

  /** A conduit across the gap from x 100 to x 100 plus `gap`, coming in and going out at these levels. */
  const across = (left: number, right: number, gap = 200) => ({
    from: { x: 50, y: left, halfWidth: 50, halfHeight: 10 },
    to: { x: 150 + gap, y: right, halfWidth: 50, halfHeight: 10 },
  });
  const lanesFor = (...routes: ReturnType<typeof across>[]) => lanes(routes, RADIUS, APART);

  it("leaves a conduit on its own in the middle of its gap", () => {
    expect(lanesFor(across(0, 100))).toEqual([0]);
  });

  it("leaves conduits whose upright runs stay apart in the middle", () => {
    expect(lanesFor(across(0, 100), across(200, 300))).toEqual([0, 0]);
  });

  it("gives a lane each to conduits whose upright runs come within a lane of each other", () => {
    expect(lanesFor(across(0, 100), across(130, 230))).not.toEqual([0, 0]);
  });

  it("puts the lower of two conduits running down on the left, so that neither crosses the other", () => {
    // The lower comes in below the other's way in, and goes out below its way out.
    expect(lanesFor(across(0, 200), across(100, 300))).toEqual([20, -20]);
  });

  it("puts the higher of two conduits running up on the left, so that neither crosses the other", () => {
    expect(lanesFor(across(200, 0), across(300, 100))).toEqual([-20, 20]);
  });

  it("orders a chain of conduits, even where the two at its ends never meet", () => {
    // Each must go left of the one before, and the first and last have nothing to say to each other.
    expect(lanesFor(across(0, 100), across(60, 300), across(260, 500))).toEqual([40, 0, -40]);
  });

  it("gives the same lanes whichever way the power runs", () => {
    const flipped = ({ from, to }: ReturnType<typeof across>) => ({ from: to, to: from });
    expect(lanesFor(flipped(across(0, 200)), across(100, 300))).toEqual([20, -20]);
    expect(lanesFor(flipped(across(0, 200)), flipped(across(100, 300)))).toEqual([20, -20]);
  });

  it("gives the same lanes in whatever order the conduits come, as they do when one goes idle", () => {
    const [a, b, c] = [across(0, 100), across(60, 300), across(260, 500)];
    expect(lanesFor(c, a, b)).toEqual([-40, 40, 0]);
    expect(lanesFor(b, c, a)).toEqual([0, -40, 40]);
    // Two that cross either way round keep to the order of their levels.
    expect(lanesFor(across(0, 400), across(100, 300))).toEqual([-20, 20]);
    expect(lanesFor(across(100, 300), across(0, 400))).toEqual([20, -20]);
  });

  it("shares out a gap too narrow for its lanes, keeping every conduit inside it", () => {
    expect(lanesFor(across(0, 200, 60), across(100, 300, 60))).toEqual([15, -15]);
  });

  it("sets lanes a full lane apart where the conduits' gaps differ a little", () => {
    const { from, to } = across(100, 300);
    const wider = { from, to: { ...to, x: to.x + 20 } };
    const shifts = lanesFor(across(0, 200), wider);
    // Their gaps' middles are x 200 and x 210, and the lanes center on what lies between them.
    expect(200 + shifts[0]!).toBe(225);
    expect(210 + shifts[1]!).toBe(185);
  });

  it("leaves out a conduit with no upright run, since nothing can lie along it", () => {
    expect(lanesFor(across(0, 200), across(100, 100))).toEqual([0, 0]);
    // Levels so nearly equal are drawn straight too.
    const nearly = { from: { ...across(0, 0).from, hub: true }, to: { ...across(0, 0).to, y: 1, hub: true } };
    expect(lanesFor(across(-100, 100), nearly)).toEqual([0, 0]);
  });

  it("leaves out conduits running down a column, and any in another gap", () => {
    const top = { x: 0, y: 0, halfWidth: 100, halfHeight: 40 };
    const bottom = { x: 150, y: 300, halfWidth: 100, halfHeight: 40 };
    expect(lanes([{ from: top, to: bottom }, { from: top, to: bottom }], RADIUS, APART)).toEqual([0, 0]);
    const further = { from: { ...across(0, 200).from, x: 650 }, to: { ...across(0, 200).to, x: 950 } };
    expect(lanesFor(across(0, 200), further)).toEqual([0, 0]);
  });
});

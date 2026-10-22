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

  it("runs straight between panels in line, plugged a little under each", () => {
    const { d, middle, angle } = conduitPath(left, { x: 300, y: 0, halfWidth: 50, halfHeight: 20 }, 28);
    // The facing edges are at x 50 and 250; the conduit reaches 6 under each.
    expect(d).toBe("M44,0 L256,0");
    expect(middle).toEqual({ x: 150, y: 0 });
    expect(angle).toBe(0);
  });

  it("turns in the middle of the gap between columns, with rounded elbows", () => {
    const { d, middle, angle } = conduitPath(left, { x: 300, y: 100, halfWidth: 50, halfHeight: 20 }, 28);
    expect(d).toBe("M44,0 L122,0 Q150,0 150,28 L150,72 Q150,100 178,100 L256,100");
    expect(middle).toEqual({ x: 150, y: 50 });
    expect(angle).toBe(90);
  });

  it("runs the other way when the power does", () => {
    const { d, angle } = conduitPath({ x: 300, y: 100, halfWidth: 50, halfHeight: 20 }, left, 28);
    expect(d).toBe("M256,100 L178,100 Q150,100 150,72 L150,28 Q150,0 122,0 L44,0");
    expect(angle).toBe(270);
  });

  it("runs down the gap between rows when one panel is above the other", () => {
    const top = { x: 0, y: 0, halfWidth: 100, halfHeight: 40 };
    const bottom = { x: 150, y: 300, halfWidth: 100, halfHeight: 40 };
    const { d, middle, angle } = conduitPath(top, bottom, 28);
    expect(d).toBe("M0,34 L0,122 Q0,150 28,150 L122,150 Q150,150 150,178 L150,266");
    expect(middle).toEqual({ x: 75, y: 150 });
    expect(angle).toBe(0);
  });

  it("runs straight through the stretch two nearly level panels share, rather than jogging", () => {
    const top = { x: 0, y: 0, halfWidth: 100, halfHeight: 40 };
    const bottom = { x: 20, y: 300, halfWidth: 100, halfHeight: 40 };
    // They share x -80 to 100, so it runs at x 10.
    expect(conduitPath(top, bottom, 28).d).toBe("M10,34 L10,266");
    const beside = { x: 300, y: 12, halfWidth: 50, halfHeight: 20 };
    expect(conduitPath(left, beside, 28).d).toBe("M44,6 L256,6");
  });

  it("measures its length along the bends", () => {
    expect(conduitPath(left, { x: 300, y: 0, halfWidth: 50, halfHeight: 20 }, 28).length).toBe(212);
    // 212 across and 100 down, less the corners the two elbows cut.
    expect(conduitPath(left, { x: 300, y: 100, halfWidth: 50, halfHeight: 20 }, 28).length).toBeCloseTo(264.28, 2);
  });

  it("keeps its route with a deeper tuck, reaching no further than each panel's center", () => {
    const right = { x: 300, y: 100, halfWidth: 50, halfHeight: 20 };
    expect(conduitPath(left, right, 28, 40).d).toBe("M10,0 L122,0 Q150,0 150,28 L150,72 Q150,100 178,100 L290,100");
    expect(conduitPath(left, right, 28, 80).d).toBe("M0,0 L122,0 Q150,0 150,28 L150,72 Q150,100 178,100 L300,100");
  });
});

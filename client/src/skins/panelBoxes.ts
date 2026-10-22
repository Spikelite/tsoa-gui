import { useLayoutEffect, useState, type RefObject } from "react";

import type { Flow } from "../model/system";

export type Point = { x: number; y: number };

/** A panel's center and half its size, relative to the element holding the flows. */
export type Box = Point & { halfWidth: number; halfHeight: number };

/**
 * The box of every panel marked with `data-part`, relative to the element
 * holding the given SVG, measured again whenever the layout changes. Flows are
 * drawn between their centers, underneath the panels. The panels are found
 * through the SVG's parent because a parent's own ref is not yet set when its
 * child's layout effect runs.
 */
export function usePanelBoxes(svg: RefObject<SVGSVGElement | null>, flows: Flow[]): Partial<Record<string, Box>> {
  const [boxes, setBoxes] = useState<Partial<Record<string, Box>>>({});
  const layoutKey = [...new Set(flows.flatMap((flow) => [flow.source, flow.target]))].sort().join(",");

  useLayoutEffect(() => {
    const root = svg.current?.parentElement;
    if (!root) {
      return;
    }
    const measure = () => {
      const origin = root.getBoundingClientRect();
      const next: Record<string, Box> = {};
      root.querySelectorAll<HTMLElement>("[data-part]").forEach((panel) => {
        const box = panel.getBoundingClientRect();
        next[panel.dataset.part ?? ""] = {
          x: box.left - origin.left + box.width / 2,
          y: box.top - origin.top + box.height / 2,
          halfWidth: box.width / 2,
          halfHeight: box.height / 2,
        };
      });
      setBoxes(next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll("[data-part]").forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, [svg, layoutKey]);

  return boxes;
}

/** Where a line from a box's center toward a point leaves the box. */
function edgeToward(box: Box, toward: Point): Point {
  const dx = toward.x - box.x;
  const dy = toward.y - box.y;
  if (dx === 0 && dy === 0) {
    return box;
  }
  const t = Math.min(dx === 0 ? Infinity : box.halfWidth / Math.abs(dx), dy === 0 ? Infinity : box.halfHeight / Math.abs(dy));
  return { x: box.x + dx * Math.min(t, 1), y: box.y + dy * Math.min(t, 1) };
}

/**
 * The points of a flow's line: from one panel's center to the other's, bending
 * nowhere, with a middle point halfway along the stretch between the two
 * panels' edges. That stretch is the only part not under a panel, so a marker
 * on the middle point is always visible, whatever the panels' sizes.
 */
export function flowPoints(from: Box, to: Box): string {
  const leaving = edgeToward(from, to);
  const arriving = edgeToward(to, from);
  const middle = { x: (leaving.x + arriving.x) / 2, y: (leaving.y + arriving.y) / 2 };
  return `${from.x},${from.y} ${middle.x},${middle.y} ${to.x},${to.y}`;
}

/** A conduit's route: its path, its length, and a point and direction for a marker. */
export type Conduit = { d: string; length: number; middle: Point; angle: number };

type Axis = "x" | "y";

// The length of a rounded elbow as a share of its radius: a quadratic curve
// with its control point at the corner.
const ELBOW = 1.1478;

function half(box: Box, axis: Axis): number {
  return axis === "x" ? box.halfWidth : box.halfHeight;
}

/**
 * A conduit's path from one panel to another, in right angles with rounded
 * elbows, as the console draws its connections. It runs from the edge of one
 * panel to the facing edge of the other, reaching `tuck` pixels under each
 * (never past its center) so it plugs in. Panels side by side are joined
 * across the gap between their columns, turning in its middle; panels in one
 * column, down the gap between their rows. The bends depend only on where the
 * panels are, so a deeper tuck gives the same route with longer ends.
 */
export function conduitPath(from: Box, to: Box, radius: number, tuck = 6): Conduit {
  // The main axis crosses the gap between the panels; the cross axis runs along it.
  const main: Axis = Math.abs(to.x - from.x) > from.halfWidth + to.halfWidth ? "x" : "y";
  const cross: Axis = main === "x" ? "y" : "x";
  const sa = Math.sign(to[main] - from[main]) || 1;
  const leaving = from[main] + sa * half(from, main);
  const arriving = to[main] - sa * half(to, main);
  const turn = (leaving + arriving) / 2;
  const a1 = leaving - sa * Math.min(tuck, half(from, main));
  const a2 = arriving + sa * Math.min(tuck, half(to, main));
  const [b1, b2] = levels(from[cross], half(from, cross), to[cross], half(to, cross), radius);
  const sb = Math.sign(b2 - b1);
  const r = Math.min(radius, Math.abs(b2 - b1) / 2, Math.abs(turn - leaving));
  const point = (a: number, b: number) => (main === "x" ? `${a},${b}` : `${b},${a}`);
  const at = (a: number, b: number): Point => (main === "x" ? { x: a, y: b } : { x: b, y: a });

  if (sb === 0 || r < 1) {
    // In line, or so nearly that the bends would vanish: a straight run.
    return {
      d: `M${point(a1, b1)} L${point(a2, b2)}`,
      length: Math.hypot(a2 - a1, b2 - b1),
      middle: at(turn, (b1 + b2) / 2),
      angle: heading(at(sa, 0)),
    };
  }
  return {
    d: [
      `M${point(a1, b1)}`,
      `L${point(turn - sa * r, b1)}`,
      `Q${point(turn, b1)} ${point(turn, b1 + sb * r)}`,
      `L${point(turn, b2 - sb * r)}`,
      `Q${point(turn, b2)} ${point(turn + sa * r, b2)}`,
      `L${point(a2, b2)}`,
    ].join(" "),
    length: Math.abs(a2 - a1) + Math.abs(b2 - b1) - 4 * r + 2 * ELBOW * r,
    middle: at(turn, (b1 + b2) / 2),
    angle: heading(at(0, sb)),
  };
}

/**
 * Where a conduit meets two panels along their facing edges: at their
 * centers, unless those are so nearly level that the bends would make only a
 * jog. Then it runs straight, through the middle of the stretch both share.
 */
function levels(a: number, halfA: number, b: number, halfB: number, radius: number): [number, number] {
  if (Math.abs(b - a) >= radius) {
    return [a, b];
  }
  const shared = (Math.max(a - halfA, b - halfB) + Math.min(a + halfA, b + halfB)) / 2;
  return [shared, shared];
}

/** The direction of a vector in degrees, clockwise from the x axis as SVG turns. */
function heading(direction: Point): number {
  return (Math.atan2(direction.y, direction.x) * 180) / Math.PI + (direction.y < 0 ? 360 : 0);
}

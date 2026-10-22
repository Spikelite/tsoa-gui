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

/**
 * A conduit's path from one panel to another, in right angles with rounded
 * elbows, as the console draws its connections. It runs from the edge of one
 * panel to the facing edge of the other, a little under each so it plugs in.
 * Panels side by side are joined across the gap between their columns;
 * panels in one column, down the gap between their rows. Returns the path and
 * the point and direction for a marker in the middle of its visible stretch.
 */
export function conduitPath(from: Box, to: Box, radius: number): { d: string; middle: Point; angle: number } {
  const tuck = 6;
  const across = Math.abs(to.x - from.x) > from.halfWidth + to.halfWidth;
  if (across) {
    const sx = Math.sign(to.x - from.x);
    const x1 = from.x + sx * (from.halfWidth - tuck);
    const x2 = to.x - sx * (to.halfWidth - tuck);
    const gapMiddle = (from.x + sx * from.halfWidth + to.x - sx * to.halfWidth) / 2;
    const [y1, y2] = levels(from.y, from.halfHeight, to.y, to.halfHeight, radius);
    return elbows("x", x1, y1, x2, y2, gapMiddle, radius);
  }
  const sy = Math.sign(to.y - from.y) || 1;
  const y1 = from.y + sy * (from.halfHeight - tuck);
  const y2 = to.y - sy * (to.halfHeight - tuck);
  const gapMiddle = (from.y + sy * from.halfHeight + to.y - sy * to.halfHeight) / 2;
  const [x1, x2] = levels(from.x, from.halfWidth, to.x, to.halfWidth, radius);
  return elbows("y", x1, y1, x2, y2, gapMiddle, radius);
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

function elbows(
  main: "x" | "y", x1: number, y1: number, x2: number, y2: number, turn: number, radius: number,
): { d: string; middle: Point; angle: number } {
  // In "x" the path runs along x to the turn, along y, then along x again;
  // "y" is the same with the axes swapped.
  const [a1, b1, a2, b2] = main === "x" ? [x1, y1, x2, y2] : [y1, x1, y2, x2];
  const sa = Math.sign(a2 - a1) || 1;
  const sb = Math.sign(b2 - b1);
  const r = Math.min(radius, Math.abs(b2 - b1) / 2, Math.abs(turn - a1), Math.abs(a2 - turn));
  const point = (a: number, b: number) => (main === "x" ? `${a},${b}` : `${b},${a}`);
  let d: string;
  let middle: Point;
  let angle: number;
  if (sb === 0 || r < 1) {
    // In line, or so nearly that the bends would vanish: a straight run.
    d = `M${point(a1, b1)} L${point(a2, b2)}`;
    const m = (a1 + a2) / 2;
    middle = main === "x" ? { x: m, y: (b1 + b2) / 2 } : { x: (b1 + b2) / 2, y: m };
    angle = main === "x" ? (sa > 0 ? 0 : 180) : sa > 0 ? 90 : 270;
  } else {
    d = [
      `M${point(a1, b1)}`,
      `L${point(turn - sa * r, b1)}`,
      `Q${point(turn, b1)} ${point(turn, b1 + sb * r)}`,
      `L${point(turn, b2 - sb * r)}`,
      `Q${point(turn, b2)} ${point(turn + sa * r, b2)}`,
      `L${point(a2, b2)}`,
    ].join(" ");
    const m = (b1 + b2) / 2;
    middle = main === "x" ? { x: turn, y: m } : { x: m, y: turn };
    angle = main === "x" ? (sb > 0 ? 90 : 270) : sb > 0 ? 0 : 180;
  }
  return { d, middle, angle };
}

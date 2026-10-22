import { useLayoutEffect, useState, type RefObject } from "react";

import type { Flow } from "../model/system";

export type Point = { x: number; y: number };

/** A rectangle's center and half its size, relative to the element holding the flows. */
type Rect = Point & { halfWidth: number; halfHeight: number };

/**
 * Where flows meet a panel: its own box, or the box of the graphic inside it
 * that flows plug into, with the whole panel's box as `panel`. A graphic
 * marked `data-anchor="hub"` is one flows run on into, to its center; one
 * marked `data-anchor="open"` has nothing in the way of a flow from any side
 * but the panel's name, marked `data-anchor-label`, which a flow running down
 * the column into the name plugs into instead.
 */
export type Box = Rect & { panel?: Rect; hub?: boolean; open?: boolean; label?: Rect };

/**
 * The box of every panel marked with `data-part`, or of the element inside it
 * marked with `data-anchor`, relative to the element holding the given SVG,
 * measured again whenever the layout changes. Flows are
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
        const rect = (element: HTMLElement): Rect => {
          const box = element.getBoundingClientRect();
          return {
            x: box.left - origin.left + box.width / 2,
            y: box.top - origin.top + box.height / 2,
            halfWidth: box.width / 2,
            halfHeight: box.height / 2,
          };
        };
        // A panel can mark the graphic inside it that flows plug into.
        const anchor = panel.querySelector<HTMLElement>("[data-anchor]");
        const label = panel.querySelector<HTMLElement>("[data-anchor-label]");
        next[panel.dataset.part ?? ""] = anchor
          ? {
              ...rect(anchor),
              panel: rect(panel),
              hub: anchor.dataset.anchor === "hub",
              open: anchor.dataset.anchor === "open",
              ...(label ? { label: rect(label) } : {}),
            }
          : rect(panel);
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

/** A conduit's route: its path, and a point and direction for a marker. */
export type Conduit = { d: string; middle: Point; angle: number };

type Axis = "x" | "y";

function half(box: Rect, axis: Axis): number {
  return axis === "x" ? box.halfWidth : box.halfHeight;
}

/**
 * A conduit's path from one panel to another, in right angles with rounded
 * elbows, as the console draws its connections. It runs from where flows meet
 * one panel to where they meet the other, ending flush with each, and turns
 * in the middle of the gap between the two panels, so it never crosses either
 * one's readings. Panels side by side are joined across the gap between their
 * columns; panels in one column, down the gap between their rows.
 */
export function conduitPath(from: Box, to: Box, radius: number): Conduit {
  const fromPanel = from.panel ?? from;
  const toPanel = to.panel ?? to;
  // The main axis crosses the gap between the panels; the cross axis runs along it.
  const main: Axis =
    Math.abs(toPanel.x - fromPanel.x) > fromPanel.halfWidth + toPanel.halfWidth ? "x" : "y";
  const cross: Axis = main === "x" ? "y" : "x";
  const sa = Math.sign(toPanel[main] - fromPanel[main]) || 1;
  const turn =
    (fromPanel[main] + sa * half(fromPanel, main) + toPanel[main] - sa * half(toPanel, main)) / 2;
  const [b1, b2] = levels(from, to, cross, radius);
  const a1 = end(from, main, sa, b1);
  const a2 = end(to, main, -sa, b2);
  const sb = Math.sign(b2 - b1);
  const r = Math.min(radius, Math.abs(b2 - b1) / 2, Math.abs(turn - a1), Math.abs(a2 - turn));
  const point = (a: number, b: number) => (main === "x" ? `${a},${b}` : `${b},${a}`);
  const at = (a: number, b: number): Point => (main === "x" ? { x: a, y: b } : { x: b, y: a });

  if (sb === 0 || r < 1) {
    // In line, or so nearly that the bends would vanish: a straight run.
    return {
      d: `M${point(a1, b1)} L${point(a2, b2)}`,
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
    middle: at(turn, (b1 + b2) / 2),
    angle: heading(at(0, sb)),
  };
}

/**
 * Where a conduit ends at a box, along the main axis, on the side facing the
 * way it runs. Across a gap between columns it plugs into what the panel
 * marks. Down a column it ends at the panel's own edge instead, since a
 * panel's readings sit between its name and its top or bottom, unless what
 * it marks sits at that edge or is open, and plugs into the panel's name
 * if the name is in its way. A hub it runs on into, to its center.
 */
function end(box: Box, main: Axis, toward: number, level: number): number {
  const panel = box.panel ?? box;
  const edge = (rect: Rect) => rect[main] + toward * half(rect, main);
  const cross: Axis = main === "x" ? "y" : "x";
  if (main === "y" && box.label && Math.abs(level - box.label[cross]) <= half(box.label, cross)) {
    return edge(box.label);
  }
  const atEdge = box.open || Math.abs(edge(box) - edge(panel)) < 4;
  if (box.hub && (main === "x" || atEdge)) {
    return box[main];
  }
  return main === "x" || atEdge ? edge(box) : edge(panel);
}

/**
 * Where a conduit meets two boxes along their facing edges: at their centers,
 * unless those are so nearly level that the bends would make only a jog.
 * Then it runs straight: through the center of a hub or a graphic a panel
 * marks, if the other box reaches that far, or else through the middle of
 * the stretch both share.
 */
function levels(from: Box, to: Box, cross: Axis, radius: number): [number, number] {
  const [a, b] = [from[cross], to[cross]];
  const reaches = (box: Box, level: number) => Math.abs(level - box[cross]) <= half(box, cross);
  // A hub is met at its center, through its port: straight if the other box
  // reaches that level, or else with bends however small.
  if (from.hub || to.hub) {
    const level = from.hub ? a : b;
    return reaches(from.hub ? to : from, level) ? [level, level] : [a, b];
  }
  if (Math.abs(b - a) >= radius) {
    return [a, b];
  }
  if (from.panel && reaches(to, a)) {
    return [a, a];
  }
  if (to.panel && reaches(from, b)) {
    return [b, b];
  }
  const shared =
    (Math.max(a - half(from, cross), b - half(to, cross)) + Math.min(a + half(from, cross), b + half(to, cross))) / 2;
  return [shared, shared];
}

/** The direction of a vector in degrees, clockwise from the x axis as SVG turns. */
function heading(direction: Point): number {
  return (Math.atan2(direction.y, direction.x) * 180) / Math.PI + (direction.y < 0 ? 360 : 0);
}

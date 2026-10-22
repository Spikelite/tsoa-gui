import { useLayoutEffect, useState, type RefObject } from "react";

import type { Flow } from "../model/system";

export type Point = { x: number; y: number };

/** A rectangle's center and half its size, relative to the element holding the flows. */
type Rect = Point & { halfWidth: number; halfHeight: number };

/**
 * Where flows meet a panel: its own box, or the box of the graphic inside it
 * that flows plug into, with the whole panel's box as `panel`. A graphic
 * marked `data-anchor="hub"` is one flows run on into, to its center; one
 * marked `data-anchor="bus"` is one they run on along, to its far end; one
 * marked `data-anchor="launch"` is one they set off from, timed from there; one
 * marked `data-anchor="open"` has nothing above it in the way of a flow but
 * the panel's name, marked `data-anchor-label`, which a flow running down
 * the column into the name plugs into instead.
 */
export type Box = Rect & {
  panel?: Rect; hub?: boolean; bus?: boolean; launch?: boolean; open?: boolean; label?: Rect;
};

/**
 * The box of every panel marked with `data-part`, or of the element inside it
 * marked with `data-anchor`, relative to the element holding the given SVG,
 * measured again whenever the layout changes, or when `revision` does, for a
 * change the layout does not report, such as a panel moved by a transform. Flows are
 * drawn between their centers, underneath the panels. The panels are found
 * through the SVG's parent because a parent's own ref is not yet set when its
 * child's layout effect runs.
 */
export function usePanelBoxes(
  svg: RefObject<SVGSVGElement | null>, flows: Flow[], revision = 0,
): Partial<Record<string, Box>> {
  return usePanelMeasure(svg, flows, revision).boxes;
}

/** The panels' boxes as usePanelBoxes measures them, with the revision they were measured at. */
export type Measure = { boxes: Partial<Record<string, Box>>; revision: number };

export function usePanelMeasure(svg: RefObject<SVGSVGElement | null>, flows: Flow[], revision = 0): Measure {
  const [measured, setMeasured] = useState<Measure>({ boxes: {}, revision });
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
              bus: anchor.dataset.anchor === "bus",
              launch: anchor.dataset.anchor === "launch",
              open: anchor.dataset.anchor === "open",
              ...(label ? { label: rect(label) } : {}),
            }
          : rect(panel);
      });
      setMeasured({ boxes: next, revision });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll("[data-part]").forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, [svg, layoutKey, revision]);

  return measured;
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

// The length of a rounded elbow as a share of its radius: a quadratic curve
// with its control point at the corner.
const ELBOW = 1.1478;

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
 * Where a conduit ends at a box, along the main axis, on the side facing the
 * way it runs. Across a gap between columns it plugs into what the panel
 * marks. Down a column it ends at the panel's own edge instead, since a
 * panel's readings sit between its name and its top or bottom, unless what
 * it marks sits at that edge or is open from above, and plugs into the panel's name
 * if the name is in its way. A hub it runs on into, to its center, and a bus
 * along, to its far end.
 */
function end(box: Box, main: Axis, toward: number, level: number): number {
  const panel = box.panel ?? box;
  const edge = (rect: Rect) => rect[main] + toward * half(rect, main);
  const cross: Axis = main === "x" ? "y" : "x";
  // The name sits at the panel's top, so only a conduit from above meets it.
  if (main === "y" && toward < 0 && box.label && Math.abs(level - box.label[cross]) <= half(box.label, cross)) {
    return edge(box.label);
  }
  const atEdge = (box.open && toward < 0) || Math.abs(edge(box) - edge(panel)) < 4;
  // A hub's readings never sit straight below it, so a conduit leaving or
  // reaching its underside runs on to its center too.
  if (box.hub && (main === "x" || atEdge || toward > 0)) {
    return box[main];
  }
  if (box.bus && main === "x") {
    return box[main] - toward * half(box, main);
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
  // A hub, a bus or a row that launches a conduit is met at its own level,
  // through its port: straight if the other box reaches that level, or else
  // with bends however small; between two of them, always at both levels.
  const fixed = (box: Box) => box.hub || box.bus || box.launch;
  if (fixed(from) && fixed(to)) {
    return [a, b];
  }
  if (fixed(from) || fixed(to)) {
    const level = fixed(from) ? a : b;
    return reaches(fixed(from) ? to : from, level) ? [level, level] : [a, b];
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

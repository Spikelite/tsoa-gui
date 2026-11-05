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
 * the column into the name plugs into instead. A `point` is a junction with
 * no panel of its own, which flows meet at its exact place.
 */
export type Box = Rect & {
  panel?: Rect; hub?: boolean; bus?: boolean; launch?: boolean; open?: boolean; label?: Rect; point?: boolean;
};

/**
 * The DC bus, where the inverter/charger, the battery, solar and the DC loads
 * meet: on the line from the inverter/charger down to the battery, halfway
 * across the gap between their panels, so that the flows joining it from
 * either side run along that gap. It stands in the battery's column, so a flow
 * from beside it bends in the gap between columns, as one to the battery would.
 */
export function dcBus(boxes: Partial<Record<string, Box>>): Box | undefined {
  const inverter = boxes.inverter_charger;
  const battery = boxes.battery;
  if (!inverter || !battery) {
    return undefined;
  }
  const above = inverter.panel ?? inverter;
  const below = battery.panel ?? battery;
  const [upper, lower] = above.y < below.y ? [above, below] : [below, above];
  const y = (upper.y + upper.halfHeight + lower.y - lower.halfHeight) / 2;
  return {
    x: inverter.x, y, halfWidth: 0, halfHeight: 0, point: true,
    panel: { x: below.x, y, halfWidth: below.halfWidth, halfHeight: 0 },
  };
}

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
      const bus = dcBus(next);
      if (bus) {
        next.dc_bus = bus;
      }
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
// with its control point at the corner, sqrt(2) + ln(1 + sqrt(2)) over sqrt(2).
const ELBOW = 1.6232;

export type Axis = "x" | "y";

function half(box: Rect, axis: Axis): number {
  return axis === "x" ? box.halfWidth : box.halfHeight;
}

/**
 * The axis a conduit crosses the gap between two boxes' panels along, and
 * which way it runs on it: across columns where the panels stand apart side
 * to side, or else up or down a column.
 */
export function approach(from: Box, to: Box): { main: Axis; sign: number } {
  const fromPanel = from.panel ?? from;
  const toPanel = to.panel ?? to;
  const main: Axis =
    Math.abs(toPanel.x - fromPanel.x) > fromPanel.halfWidth + toPanel.halfWidth ? "x" : "y";
  return { main, sign: Math.sign(toPanel[main] - fromPanel[main]) || 1 };
}

/** Where two panels face each other along an axis, the first panel's edge first. */
function facingEdges(from: Rect, to: Rect, main: Axis, sign: number): [number, number] {
  return [from[main] + sign * half(from, main), to[main] - sign * half(to, main)];
}

/**
 * A conduit's path from one panel to another, in right angles with rounded
 * elbows, as the console draws its connections. It runs from where flows meet
 * one panel to where they meet the other, ending flush with each, and turns
 * in the gap between the two panels, so it never crosses either one's
 * readings: in the gap's middle, or `shift` from there in a lane of its own.
 * Panels side by side are joined across the gap between their columns; panels
 * in one column, down the gap between their rows.
 */
export function conduitPath(from: Box, to: Box, radius: number, shift = 0): Conduit {
  // The main axis crosses the gap between the panels; the cross axis runs along it.
  const { main, sign: sa } = approach(from, to);
  const cross: Axis = main === "x" ? "y" : "x";
  const [near, far] = facingEdges(from.panel ?? from, to.panel ?? to, main, sa);
  const turn = (near + far) / 2 + shift;
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

/** A conduit's upright run in a gap between columns, with the levels it comes in and goes out at, left to right. */
type Run = { index: number; middle: number; width: number; left: number; right: number; low: number; high: number };

/**
 * How far from the middle of its gap each conduit turns. Every conduit crossing
 * a gap between columns turns in its middle, which is one lane, so two whose
 * upright runs meet would lie on top of each other, and which two do depends
 * on the screen. Those take a lane each, `apart` from the next, or an equal
 * share of a gap too narrow for that, and the rest stay in the middle.
 *
 * Neither a conduit's power nor its place in `routes`, which changes as
 * conduits go idle, has any say, so a conduit does not jump between lanes as
 * the power changes.
 */
export function lanes(routes: { from: Box; to: Box }[], radius: number, apart: number): number[] {
  const runs = routes.flatMap(({ from, to }, index): Run[] => {
    const { main, sign } = approach(from, to);
    const [start, end] = levels(from, to, "y", radius);
    // conduitPath draws levels this close as a straight run, with nothing upright to keep apart.
    if (main !== "x" || Math.abs(end - start) < 2) {
      return [];
    }
    const [near, far] = facingEdges(from.panel ?? from, to.panel ?? to, main, sign);
    const [left, right] = sign > 0 ? [start, end] : [end, start];
    return [{
      index, middle: (near + far) / 2, width: Math.abs(far - near),
      left, right, low: Math.min(left, right), high: Math.max(left, right),
    }];
  });
  const meet = (a: Run, b: Run) =>
    Math.abs(a.middle - b.middle) < apart && a.low < b.high + apart && b.low < a.high + apart;
  const clear = (level: number, run: Run) => level <= run.low - apart || level >= run.high + apart;
  // To the left of another, a conduit's way out has to pass above or below the
  // other's upright run, and the other's way in above or below its own.
  const canGoLeft = (a: Run, b: Run) => clear(a.right, b) && clear(b.left, a);

  const shifts = routes.map(() => 0);
  const placed = new Set<Run>();
  for (const run of runs) {
    if (placed.has(run)) {
      continue;
    }
    const group = [run];
    for (const member of group) {
      group.push(...runs.filter((other) => !group.includes(other) && meet(member, other)));
    }
    group.forEach((member) => placed.add(member));
    const middle = group.reduce((sum, member) => sum + member.middle, 0) / group.length;
    const spacing = Math.min(apart, ...group.map((member) => member.width / group.length));
    inOrder(group, canGoLeft).forEach((member, place) => {
      shifts[member.index] = middle + (place - (group.length - 1) / 2) * spacing - member.middle;
    });
  }
  return shifts;
}

/**
 * Runs from left to right, each left of those it has to be. Two that would
 * cross whichever way round they go keep to the order of their levels, so the
 * order depends only on where they are.
 */
function inOrder(group: Run[], canGoLeft: (a: Run, b: Run) => boolean): Run[] {
  const waiting = [...group].sort((a, b) => a.left - b.left || a.right - b.right);
  const order: Run[] = [];
  while (waiting.length > 0) {
    const free = waiting.findIndex((run) =>
      !waiting.some((other) => other !== run && canGoLeft(other, run) && !canGoLeft(run, other)));
    order.push(...waiting.splice(Math.max(free, 0), 1));
  }
  return order;
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
  if (box.point) {
    return box[main];
  }
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
  const fixed = (box: Box) => box.hub || box.bus || box.launch || box.point;
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

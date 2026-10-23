import { HUB_EDGE, HUB_VIEW, type HubPort, type HubSide } from "./hubPorts";

// The inverter/charger's hub as shapes in its own units, HUB_VIEW square: its
// coil, and the strands each conduit carries on as into it. The hub draws the
// coil and the pulses round it; the conduits draw the strands, on their own
// layer, so that each conduit and its strands are one drawing that meets
// itself exactly at any size and any screen scaling.

export const SIZE = HUB_VIEW;
export const CENTER = SIZE / 2;
// The center: a thin band round a light, which pulses run in to.
export const BAND = 24;
// One even winding runs all the way round the core, across both rings of
// cells: legs from just outside the outer ring in to just outside the band
// and back out, LEGS of them, each STEP round from the last.
const WIND = { outer: 49, inner: 30 };
const LEGS = 96;
const STEP = 360 / LEGS;
// Outer turns, where threads join the winding, come every other leg; a
// conduit's joins take the turns nearest where it lands, side by side.
const TURN = 2 * STEP;
const WIRE = 1.3;
// A conduit splits into THREADS threads, and each of those forks into FORKS.
const THREADS = 3;
const FORKS = 3;
const STRANDS = THREADS * FORKS;
// How far past the square's edge a strand's waves run on, hidden, so the
// blur that smooths them has wave on both sides of the edge.
const RUN_ON = 30;
// How far a thread runs straight on from the conduit before it curves away,
// and how far along the way to its joins it forks.
const STRAIGHT = 8;
const FORK_AT = 0.5;
// How many legs of the winding a pulse runs from where a thread joins it
// before it turns in to the core; an odd number, so the last leg runs inward.
const RUN = 5;

const SIDE_ANGLE: Record<HubSide, number> = { right: 0, bottom: 90, left: 180, top: 270 };

type Point = { x: number; y: number };
const polar = (radius: number, degrees: number): Point => ({
  x: CENTER + radius * Math.cos((degrees * Math.PI) / 180),
  y: CENTER + radius * Math.sin((degrees * Math.PI) / 180),
});
const at = (point: Point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
const arcLength = (radius: number, degrees: number) => (radius * Math.abs(degrees) * Math.PI) / 180;
export const fraction = (value: number) => ((value % 1) + 1) % 1;

/** A port's frame: a point `u` in from where its conduit meets the square's edge and `v` across from its middle. */
function frame(port: HubPort) {
  const dir = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 } }[port.side];
  const edge = dir.x === 0
    ? { x: CENTER + port.offset, y: CENTER + dir.y * HUB_EDGE }
    : { x: CENTER + dir.x * HUB_EDGE, y: CENTER + port.offset };
  const inward = { x: -dir.x, y: -dir.y };
  const across = { x: Math.abs(inward.y), y: Math.abs(inward.x) };
  return (u: number, v: number): Point => ({
    x: edge.x + inward.x * u + across.x * v,
    y: edge.y + inward.y * u + across.y * v,
  });
}

/**
 * The way from the middle of an outer turn at `angle` to the core: `legs`
 * legs on round the winding one way or the other, along the outer arc, then
 * in and out across the rings of cells, turn by turn, and from the inner end
 * of the last leg straight in to the core's band.
 */
function walk(angle: number, way: 1 | -1, legs: number): { d: string; length: number } {
  const first = way > 0 ? angle + STEP / 2 : angle - STEP / 2;
  const sweep = way > 0 ? 1 : 0;
  const parts = [`M${at(polar(WIND.outer, angle))}`, `A${WIND.outer} ${WIND.outer} 0 0 ${sweep} ${at(polar(WIND.outer, first))}`];
  let length = arcLength(WIND.outer, STEP / 2);
  let radius = WIND.outer;
  for (let leg = 0; leg < legs; leg++) {
    const a = first + way * leg * STEP;
    const next = radius === WIND.outer ? WIND.inner : WIND.outer;
    parts.push(`L${at(polar(next, a))}`);
    length += WIND.outer - WIND.inner;
    radius = next;
    if (leg < legs - 1) {
      parts.push(`A${radius} ${radius} 0 0 ${sweep} ${at(polar(radius, a + way * STEP))}`);
      length += arcLength(radius, STEP);
    }
  }
  const last = first + way * (legs - 1) * STEP;
  parts.push(`L${at(polar(BAND, last))}`);
  length += radius - BAND;
  return { d: parts.join(" "), length };
}

/** The whole winding, one even coil all the way round the core. */
function coil(): string {
  const parts = [`M${at(polar(WIND.outer, 0))}`];
  for (let leg = 0; leg < LEGS; leg++) {
    const a = leg * STEP;
    const radius = leg % 2 === 0 ? WIND.inner : WIND.outer;
    parts.push(`L${at(polar(radius, a))}`);
    parts.push(`A${radius} ${radius} 0 0 1 ${at(polar(radius, a + STEP))}`);
  }
  return `${parts.join(" ")} Z`;
}
export const COIL = coil();

/** The middle of the outer turn nearest `angle`, where a strand joins the winding. */
function join(angle: number): number {
  // Outer turns run between legs 2m + 1 and 2m + 2.
  const m = Math.round((angle / STEP - 1.5) / 2);
  return (2 * m + 1.5) * STEP;
}

/** Points along a cubic curve, not counting its start. */
function cubic(from: Point, c1: Point, c2: Point, to: Point, count: number): Point[] {
  return Array.from({ length: count }, (_, n) => {
    const s = (n + 1) / count;
    const r = 1 - s;
    return {
      x: r ** 3 * from.x + 3 * r ** 2 * s * c1.x + 3 * r * s ** 2 * c2.x + s ** 3 * to.x,
      y: r ** 3 * from.y + 3 * r ** 2 * s * c1.y + 3 * r * s ** 2 * c2.y + s ** 3 * to.y,
    };
  });
}

const unit = (from: Point, to: Point): Point => {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
};

/**
 * One strand of a conduit: a ninth of its width where it leaves the square's
 * edge, side by side with the others so that together they are the conduit.
 * Its thread's three strands run on together, as one thread a third of the
 * conduit wide, curving toward their joins; part way there the thread forks,
 * and each strand curves on alone to its own join on the winding, narrowing
 * to the winding's wire. Drawn as a stroke of the strand's width cut to that
 * tapering outline, so it carries the conduit's own body and waves.
 */
function strand(port: HubPort, thread: number, fork: number, angles: number[]) {
  const p = frame(port);
  const width = port.width / STRANDS;
  // Across the conduit, threads in order, each thread's strands in order within it.
  const place = (thread - (THREADS - 1) / 2) * FORKS + (fork - (FORKS - 1) / 2);
  // Starting a little over the conduit's end, so no seam shows where they meet.
  const start = p(-2, place * width);
  const straight = p(STRAIGHT, place * width);
  const middle = polar(WIND.outer, angles[1]!);
  const center = p(STRAIGHT, (thread - (THREADS - 1) / 2) * FORKS * width);
  // Where the thread forks, and which way it is heading there.
  const heading = unit(center, middle);
  const forkCenter = {
    x: center.x + (middle.x - center.x) * FORK_AT,
    y: center.y + (middle.y - center.y) * FORK_AT,
  };
  // Each strand keeps its side of the thread on the way to the fork.
  const side = { x: -heading.y, y: heading.x };
  const sideways = Math.sign((straight.x - center.x) * side.x + (straight.y - center.y) * side.y);
  const apart = Math.abs(fork - (FORKS - 1) / 2) * width * sideways;
  const forked = { x: forkCenter.x + side.x * apart, y: forkCenter.y + side.y * apart };
  const inward = unit(p(0, 0), p(1, 0));
  const end = polar(WIND.outer, angles[fork]!);
  const radial = unit(polar(WIND.outer - 1, angles[fork]!), end);
  const together = cubic(straight, { x: straight.x + inward.x * 14, y: straight.y + inward.y * 14 },
    { x: forked.x - heading.x * 10, y: forked.y - heading.y * 10 }, forked, 12);
  const alone = cubic(forked, { x: forked.x + heading.x * 12, y: forked.y + heading.y * 12 },
    { x: end.x + radial.x * 14, y: end.y + radial.y * 14 }, end, 14);
  const line = [start, straight, ...together, ...alone];
  const steps = line.slice(1).map((point, n) => Math.hypot(point.x - line[n]!.x, point.y - line[n]!.y));
  const length = steps.reduce((sum, step) => sum + step, 0);
  const forkAt = steps.slice(0, 1 + together.length).reduce((sum, step) => sum + step, 0);
  // Its outline: a ninth of the conduit wide, a touch more on a side it
  // shares with another strand so they overlap with no seam, but never past
  // the conduit's own edge on the outermost strands' outer sides; until the
  // fork, then narrowing smoothly to the wire.
  const across = unit(p(0, 0), p(0, 1));
  const inwardStart = unit(start, straight);
  // Which of its two sides, the one to its left as it runs or the right, faces out of the conduit, if either.
  const leftAcross = -inwardStart.y * across.x + inwardStart.x * across.y;
  const outermost = Math.abs(place) === (STRANDS - 1) / 2;
  const leftOut = outermost && Math.sign(leftAcross) === Math.sign(place);
  const rightOut = outermost && !leftOut;
  let along = 0;
  const sides = line.map((point, n) => {
    along += n > 0 ? steps[n - 1]! : 0;
    const ahead = line[Math.min(n + 1, line.length - 1)]!;
    const behind = line[Math.max(n - 1, 0)]!;
    const tx = ahead.x - behind.x;
    const ty = ahead.y - behind.y;
    const norm = Math.hypot(tx, ty) || 1;
    const s = Math.max(0, (along - forkAt) / (length - forkAt));
    const ease = s * s * (3 - 2 * s);
    const half = (width + (WIRE - width) * ease) / 2;
    const overlap = 0.25 * (1 - ease);
    const left = half + (leftOut ? 0 : overlap);
    const right = half + (rightOut ? 0 : overlap);
    return [
      { x: point.x - (ty / norm) * left, y: point.y + (tx / norm) * left },
      { x: point.x + (ty / norm) * right, y: point.y - (tx / norm) * right },
    ] as const;
  });
  const outline = `M${sides.map(([left]) => at(left)).join(" L")} L${[...sides].reverse().map(([, right]) => at(right)).join(" L")} Z`;
  // A strand carrying power out of the hub runs from the winding to the
  // conduit, so its waves roll the way the power goes.
  const route = port.outward ? [...line].reverse() : line;
  const d = `M${route.map(at).join(" L")}`;
  // Its waves run on out past the square's edge, along the conduit, hidden
  // under the conduit's own, so the blur that smooths them has wave on both
  // sides of where the two meet; `edge` is how far along that path the edge is.
  const beyond = p(-RUN_ON, place * width);
  const waves = port.outward ? `${d} L${at(beyond)}` : `M${at(beyond)} L${route.map(at).join(" L")}`;
  // The strand itself starts 2 units outside the edge, over the conduit's end.
  const edge = port.outward ? length - 2 : RUN_ON;
  return { d, outline, length, width, stroke: width + 1, waves, edge };
}

/**
 * Where each port's joins go round the winding: the outer turns nearest where
 * it lands, side by side, moved along only as far as it takes to keep clear
 * of another port's.
 */
function stretches(ports: HubPort[]): number[] {
  const natural = ports.map((port) => {
    const across = port.side === "left" ? -1 : port.side === "right" ? 1 : port.side === "bottom" ? -1 : 1;
    return SIDE_ANGLE[port.side] + across * ((Math.atan2(port.offset * 1.4, 40) * 180) / Math.PI);
  });
  if (ports.length < 2) {
    return natural;
  }
  // Push neighbors apart round the circle until each has its stretch to itself.
  const width = STRANDS * TURN;
  const order = natural.map((angle, index) => ({ angle: ((angle % 360) + 360) % 360, index })).sort((a, b) => a.angle - b.angle);
  for (let pass = 0; pass < 40; pass++) {
    order.forEach((current, n) => {
      const next = order[(n + 1) % order.length]!;
      const gap = ((next.angle - current.angle + 360) % 360) || 360;
      if (gap < width) {
        const push = (width - gap) / 2;
        current.angle -= push;
        next.angle += push;
      }
    });
  }
  const centers = [...natural];
  order.forEach(({ angle, index }) => {
    centers[index] = angle;
  });
  return centers;
}

/**
 * Each port's strands, nine joining the winding along its stretch, and the
 * paths its pulses take round the winding each way from each join.
 */
export function threads(ports: HubPort[]) {
  const centers = stretches(ports);
  return ports.map((port, index) => {
    // The joins run round the winding the same way the strands lie across the conduit, so none cross.
    const way = port.side === "left" || port.side === "bottom" ? -1 : 1;
    const joins = Array.from({ length: STRANDS }, (_, n) => join(centers[index]! + way * (n - (STRANDS - 1) / 2) * TURN));
    const lines = Array.from({ length: THREADS }, (_, thread) => {
      const angles = joins.slice(thread * FORKS, (thread + 1) * FORKS);
      return Array.from({ length: FORKS }, (_, fork) => ({
        ...strand(port, thread, fork, angles),
        runs: ([1, -1] as const).map((round) => walk(angles[fork]!, round, RUN)),
      }));
    }).flat();
    return { port, index, lines };
  });
}

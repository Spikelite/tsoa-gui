import { useId, type CSSProperties } from "react";

import type { InverterCharger, InverterState } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { HUB_EDGE, HUB_VIEW, type HubPort, type HubPorts, type HubSide } from "./hubPorts";
import { SOFTEN, STROKES, WAVE } from "./waves";

/** What the inverter/charger is doing with power, which tints its core. */
type Duty = "inverting" | "charging" | "passing" | "idle";

const DUTIES: Partial<Record<InverterState, Duty>> = {
  inverting: "inverting",
  power_assist: "inverting",
  bulk: "charging",
  absorption: "charging",
  float: "charging",
  storage: "charging",
  equalize: "charging",
  sustain: "charging",
  passthrough: "passing",
  power_supply: "passing",
};

function duty(inverter: InverterCharger): Duty {
  return inverter.status === "offline" || inverter.state === null ? "idle" : (DUTIES[inverter.state] ?? "idle");
}

const SIZE = HUB_VIEW;
const CENTER = SIZE / 2;
const CELLS = 12;
const CELL = { length: 13, depth: 7 };
// The core's two rings of cells, by radius, and the core's own radius.
const TRACKS = [33, 43];
const CORE = 52;
// The center: a thin band round a light.
const BAND = 24;
const LIGHT = 22;
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
// How far a thread runs straight on from the conduit before it curves away,
// and how far along the way to its joins it forks.
const STRAIGHT = 8;
const FORK_AT = 0.5;
// How many legs of the winding a pulse runs each way from where a thread joins.
const RUN = 4;
const PULSE = 10;

const SIDE_ANGLE: Record<HubSide, number> = { right: 0, bottom: 90, left: 180, top: 270 };

type Point = { x: number; y: number };
const polar = (radius: number, degrees: number): Point => ({
  x: CENTER + radius * Math.cos((degrees * Math.PI) / 180),
  y: CENTER + radius * Math.sin((degrees * Math.PI) / 180),
});
const at = (point: Point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
const arcLength = (radius: number, degrees: number) => (radius * Math.abs(degrees) * Math.PI) / 180;
const fraction = (value: number) => ((value % 1) + 1) % 1;

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
 * The winding, from the middle of an outer turn at `angle`, `legs` legs on
 * round the core one way or the other: on along the outer arc, then in and
 * out across the rings of cells, turn by turn.
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
const COIL = coil();

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
  // Its outline: a ninth of the conduit wide, a touch more so the strands
  // overlap with no seam, until the fork, then narrowing smoothly to the wire.
  let along = 0;
  const sides = line.map((point, n) => {
    along += n > 0 ? steps[n - 1]! : 0;
    const ahead = line[Math.min(n + 1, line.length - 1)]!;
    const behind = line[Math.max(n - 1, 0)]!;
    const tx = ahead.x - behind.x;
    const ty = ahead.y - behind.y;
    const norm = Math.hypot(tx, ty) || 1;
    const s = Math.max(0, (along - forkAt) / (length - forkAt));
    const half = (width + 0.5 + (WIRE - width - 0.5) * (s * s * (3 - 2 * s))) / 2;
    return [
      { x: point.x - (ty / norm) * half, y: point.y + (tx / norm) * half },
      { x: point.x + (ty / norm) * half, y: point.y - (tx / norm) * half },
    ] as const;
  });
  const outline = `M${sides.map(([left]) => at(left)).join(" L")} L${[...sides].reverse().map(([, right]) => at(right)).join(" L")} Z`;
  // A strand carrying power out of the hub runs from the winding to the
  // conduit, so its waves roll the way the power goes.
  const route = port.outward ? [...line].reverse() : line;
  const d = `M${route.map(at).join(" L")}`;
  return { d, outline, length, stroke: width + 1 };
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
function threads(ports: HubPort[]) {
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

/** Keyframes for a pulse that runs a path in the first `share` of a cycle, in or out. */
function pulseKeyframes(name: string, share: number, outward: boolean): string {
  const [from, to] = outward ? [-100, PULSE] : [PULSE, -100];
  const end = (share * 100).toFixed(1);
  return `@keyframes ${name} { 0% { stroke-dashoffset: ${from}; opacity: 1; } ${end}% { stroke-dashoffset: ${to}; opacity: 1; }
    ${(share * 100 + 0.1).toFixed(1)}%, 100% { stroke-dashoffset: ${to}; opacity: 0; } }`;
}

/** How long one pulse of the center's light takes: slow when the unit is quiet, quicker the more power it handles. */
function lightPeriod(power: number): number {
  return Math.min(3, Math.max(0.6, 3 / Math.sqrt(1 + Math.abs(power) / 500)));
}

// The inverter/charger drawn as a hub that power runs through, on a dark
// square, its core wound all the way round in one even coil like a
// transformer's. Each conduit that meets it carries on past the square's
// edge as three threads of itself, its own body and waves, that curve round
// toward the coil and each fork into three, narrowing into the coil at nine
// joins along its stretch of it, so the waves pour on from the conduit
// into the coil, and from the coil out into the conduits of what it feeds.
// Round the coil, pulses run on from where a supply's threads join it and in
// to where those of what it feeds leave it, each conduit's at its own pace
// and timed to its crests. Light chases round the core's cells, clockwise
// while it charges the battery and the other way while it inverts, faster
// with every tenfold increase in power, and the light at the center pulses
// on its own, slow when the unit is quiet and quicker the more power it
// handles. Idle, it is dim and still. The core is tinted by what it is
// doing, which its state also says in words: blue plasma inverting, teal
// charging, lavender passing through.
export function InverterCore({ inverter, hub }: { inverter: InverterCharger; hub?: HubPorts }) {
  const work = duty(inverter);
  const power = Math.max(
    Math.abs(inverter.ac_in_power_w ?? 0),
    Math.abs(inverter.ac_out_power_w ?? 0),
    Math.abs(inverter.dc_power_w ?? 0),
  );
  const speed = flowSpeed(power);
  const id = useId();
  const wound = threads(hub?.ports ?? []);
  const cycle = hub?.cycleUnits || 250;
  const share = (length: number) => Math.min(0.9, Math.max(0.08, length / cycle));
  const keyframes = [
    // The threads' waves roll a whole wave on each cycle, in the hub's units.
    `@keyframes fof-thread-roll { to { stroke-dashoffset: ${-cycle}; } }`,
    ...wound.map(({ port, index, lines }) =>
      pulseKeyframes(`fof-wind-${index}`, share(Math.max(...lines.flatMap((l) => l.runs.map((r) => r.length)))), port.outward)),
  ].join(" ");

  return (
    <div className={`fof-unit fof-ring-unit fof-duty-${work} fof-flow-${speed}`} data-anchor="hub" aria-hidden="true"
      style={{ "--fof-light": `${lightPeriod(power).toFixed(2)}s` } as CSSProperties}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="fof-unit-art">
        <style>{keyframes}</style>
        <rect className="fof-hub-disc" x={CENTER - HUB_EDGE} y={CENTER - HUB_EDGE} width={2 * HUB_EDGE}
          height={2 * HUB_EDGE} rx={HUB_EDGE / 3} />
        <circle className="fof-unit-core" cx={CENTER} cy={CENTER} r={CORE} />
        {TRACKS.map((radius) =>
          Array.from({ length: CELLS }, (_, cell) => {
            const angle = (cell * 360) / CELLS;
            const wave = work === "inverting" ? CELLS - 1 - cell : cell;
            // The inner ring's cells are shorter, so the gaps between cells line up.
            const length = (CELL.length * radius) / TRACKS[1]!;
            return (
              <rect key={`${radius}-${cell}`} className="fof-unit-cell" x={CENTER - length / 2}
                y={CENTER - radius - CELL.depth / 2} width={length} height={CELL.depth}
                rx={CELL.depth / 2} transform={`rotate(${angle} ${CENTER} ${CENTER})`}
                style={{ "--wave": wave, "--waves": CELLS } as CSSProperties} />
            );
          }),
        )}
        <path className="fof-hub-wire fof-hub-coil" d={COIL} />
        {wound.map(({ port, index, lines }) => {
          const shape = `${id}-${index}`;
          return (
            <g key={port.key} className={`fof-thread${port.idle ? " fof-thread-idle" : ""}`}
              style={{ "--fof-roll": `var(--fof-roll-${port.key}, 4s)` } as CSSProperties}>
              {lines.map((line, n) => (
                <g key={n}>
                  <clipPath id={`${shape}-${n}`}>
                    <path d={line.outline} />
                  </clipPath>
                  <path className="fof-thread-body" d={line.d} strokeWidth={line.stroke}
                    clipPath={`url(#${CSS.escape(`${shape}-${n}`)})`} />
                </g>
              ))}
              {/* The waves of all the port's strands under one blur, as the
                  conduits' are, trimmed to the strands' outlines. */}
              {!port.idle && (
                <>
                  <mask id={shape} maskUnits="userSpaceOnUse" x="0" y="0" width={SIZE} height={SIZE}>
                    {lines.map((line, n) => <path key={n} d={line.outline} fill="#fff" />)}
                  </mask>
                  <filter id={`${shape}-blur`} filterUnits="userSpaceOnUse" x="0" y="0" width={SIZE} height={SIZE}>
                    <feGaussianBlur stdDeviation={(SOFTEN * cycle) / WAVE} />
                  </filter>
                  <g mask={`url(#${CSS.escape(shape)})`}>
                    <g filter={`url(#${CSS.escape(shape)}-blur)`}>
                      {lines.map((line, n) => {
                        // A crest is at the conduit's end of the thread as it
                        // reaches the square's edge, which for a thread running
                        // in is its start and for one running out is its end.
                        const crestAt = port.outward ? line.length : 0;
                        const phase = fraction(crestAt / cycle - 0.5 - port.crossing);
                        return STROKES.map((layer, index) => {
                          const dash = layer.share * cycle;
                          const gap = (cycle - dash) / 2;
                          return (
                            <path key={`${n}-${index}`} className="fof-thread-wave" d={line.d}
                              strokeWidth={line.stroke + 4}
                              strokeDasharray={`0 ${gap.toFixed(2)} ${dash.toFixed(2)} ${gap.toFixed(2)}`}
                              strokeOpacity={layer.opacity}
                              style={{ "--depth": layer.depth, "--fof-phase": phase.toFixed(3) } as CSSProperties} />
                          );
                        });
                      })}
                    </g>
                  </g>
                </>
              )}
            </g>
          );
        })}
        {wound.map(({ port, index, lines }) => !port.idle && lines.flatMap((line, n) => line.runs.map((run, way) => {
          // Round the winding, a pulse in sets off from a thread's end as a
          // crest reaches it; a pulse out arrives there as a crest leaves it.
          const atJoin = port.outward ? port.crossing - line.length / cycle : port.crossing + line.length / cycle;
          const start = port.outward ? atJoin - share(run.length) : atJoin;
          return (
            <path key={`${port.key}-pulse-${n}-${way}`} className="fof-hub-pulse" d={run.d} pathLength="100"
              style={{
                animationName: `fof-wind-${index}`,
                animationDuration: `var(--fof-roll-${port.key}, 4s)`,
                animationDelay: `calc(var(--fof-roll-${port.key}, 4s) * ${(fraction(start) - 1).toFixed(3)})`,
              } as CSSProperties} />
          );
        })))}
        <circle className="fof-hub-band" cx={CENTER} cy={CENTER} r={BAND} />
        <circle className="fof-hub-light" cx={CENTER} cy={CENTER} r={LIGHT} />
      </svg>
    </div>
  );
}

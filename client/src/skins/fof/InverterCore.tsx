import { useId, type CSSProperties } from "react";

import type { InverterCharger, InverterState } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { HUB_EDGE, HUB_VIEW, type HubPort, type HubPorts, type HubSide } from "./hubPorts";
import { LAYERS } from "./waves";

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
const LEGS = 48;
const STEP = 360 / LEGS;
const WIRE = 2;
const THREADS = 3;
// How far a thread runs straight on from the conduit before it curves away.
const STRAIGHT = 8;
// How many legs of the winding a pulse runs each way from where a thread joins.
const RUN = 6;
const PULSE = 10;
// Every other of the conduits' wave strokes: a thread is narrow enough that
// half as many make as smooth a wave.
const THREAD_LAYERS = LAYERS.filter((_, index) => index % 2 === 1);

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

/** Where a thread at `angle` joins the winding: the middle of the nearest outer turn. */
function join(angle: number): number {
  // Outer turns run between legs 2m + 1 and 2m + 2.
  const m = Math.round((angle / STEP - 1.5) / 2);
  return (2 * m + 1.5) * STEP;
}

/**
 * One thread of a conduit: a third of its width where it leaves the square's
 * edge, side by side with the others so that together they are the conduit,
 * running straight on, then curving round to join the winding and narrowing
 * to its wire as it goes. Drawn as a stroke of the conduit's width cut to
 * that tapering outline, so it carries the conduit's own body and waves.
 */
function thread(port: HubPort, place: number, angle: number) {
  const p = frame(port);
  const width = port.width / THREADS;
  const start = p(-0.5, place * width);
  const bend = p(STRAIGHT, place * width);
  const end = polar(WIND.outer, angle);
  const out = polar(WIND.outer + 1, angle);
  const inward = { x: bend.x - start.x, y: bend.y - start.y };
  const reach = Math.hypot(inward.x, inward.y);
  const c1 = { x: bend.x + (inward.x / reach) * 22, y: bend.y + (inward.y / reach) * 22 };
  const c2 = { x: end.x + (out.x - end.x) * 18, y: end.y + (out.y - end.y) * 18 };
  // The line down its middle, sampled, for its length and its outline.
  const line: Point[] = [start];
  for (let n = 1; n <= 24; n++) {
    const s = n / 24;
    const r = 1 - s;
    line.push({
      x: r ** 3 * bend.x + 3 * r ** 2 * s * c1.x + 3 * r * s ** 2 * c2.x + s ** 3 * end.x,
      y: r ** 3 * bend.y + 3 * r ** 2 * s * c1.y + 3 * r * s ** 2 * c2.y + s ** 3 * end.y,
    });
  }
  const steps = line.slice(1).map((point, n) => Math.hypot(point.x - line[n]!.x, point.y - line[n]!.y));
  const length = steps.reduce((sum, step) => sum + step, 0);
  // Its outline: a third of the conduit wide, a touch more so the threads
  // overlap with no seam, until the curve, then narrowing smoothly to the wire.
  let along = 0;
  const sides = line.map((point, n) => {
    along += n > 0 ? steps[n - 1]! : 0;
    const neighbor = line[Math.min(n + 1, line.length - 1)]!;
    const previous = line[Math.max(n - 1, 0)]!;
    const tx = neighbor.x - previous.x;
    const ty = neighbor.y - previous.y;
    const norm = Math.hypot(tx, ty) || 1;
    const s = Math.max(0, (along - STRAIGHT) / (length - STRAIGHT));
    const half = (width + 0.6 + (WIRE - width - 0.6) * (s * s * (3 - 2 * s))) / 2;
    return [
      { x: point.x - (ty / norm) * half, y: point.y + (tx / norm) * half },
      { x: point.x + (ty / norm) * half, y: point.y - (tx / norm) * half },
    ] as const;
  });
  const outline = `M${sides.map(([left]) => at(left)).join(" L")} L${[...sides].reverse().map(([, right]) => at(right)).join(" L")} Z`;
  const d = `M${at(start)} L${at(bend)} C${at(c1)} ${at(c2)} ${at(end)}`;
  // A thread carrying power out of the hub runs from the winding to the
  // conduit, so its waves roll the way the power goes.
  const reversed = `M${at(end)} C${at(c2)} ${at(c1)} ${at(bend)} L${at(start)}`;
  return { d: port.outward ? reversed : d, outline, length, stroke: width + 1 };
}

/**
 * Each port's threads, joining the winding on its side, those of two ports
 * sharing a side kept apart, and the paths its pulses take round the winding
 * each way from where a thread joins.
 */
function threads(ports: HubPort[]) {
  return ports.map((port, index) => {
    const sharing = ports.filter((other) => other.side === port.side).length;
    const base = SIDE_ANGLE[port.side];
    // A port off its side's middle has its threads turned toward where it meets the side.
    const across = port.side === "left" ? -1 : port.side === "right" ? 1 : port.side === "bottom" ? -1 : 1;
    const center = base + across * ((Math.atan2(port.offset * 1.4, 40) * 180) / Math.PI);
    const apart = sharing > 1 ? 2 * STEP : 4 * STEP;
    // The threads keep their order across the conduit as they fan out round the core.
    const order = port.side === "left" || port.side === "bottom" ? -1 : 1;
    const lines = Array.from({ length: THREADS }, (_, n) => {
      const angle = join(center + (n - 1) * apart);
      return { ...thread(port, (n - 1) * order, angle), runs: ([1, -1] as const).map((way) => walk(angle, way, RUN)) };
    });
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
// and narrow into the coil on its side, so the waves pour on from the conduit
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
        <path className="fof-hub-wire" d={COIL} />
        {wound.map(({ port, index, lines }) => lines.map((line, n) => {
          const clip = `${id}-${index}-${n}`;
          // A crest is at the conduit's end of the thread as it reaches the
          // square's edge, which for a thread running in is its start and for
          // one running out is its end.
          const crestAt = port.outward ? line.length : 0;
          const phase = fraction(crestAt / cycle - 0.5 - port.crossing);
          return (
            <g key={`${port.key}-${n}`} className={`fof-thread${port.idle ? " fof-thread-idle" : ""}`}>
              <clipPath id={clip}>
                <path d={line.outline} />
              </clipPath>
              <g clipPath={`url(#${CSS.escape(clip)})`}
                style={{ "--fof-roll": `var(--fof-roll-${port.key}, 4s)`, "--fof-phase": phase.toFixed(3) } as CSSProperties}>
                <path className="fof-thread-body" d={line.d} strokeWidth={line.stroke} />
                {!port.idle && THREAD_LAYERS.map((layer, index) => {
                  const dash = layer.share * cycle;
                  const gap = (cycle - dash) / 2;
                  return (
                    <path key={index} className="fof-thread-wave" d={line.d} strokeWidth={line.stroke}
                      strokeDasharray={`0 ${gap.toFixed(2)} ${dash.toFixed(2)} ${gap.toFixed(2)}`}
                      style={{ "--depth": layer.depth } as CSSProperties} />
                  );
                })}
              </g>
            </g>
          );
        }))}
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

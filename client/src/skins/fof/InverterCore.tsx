import { useId, type CSSProperties } from "react";

import type { InverterCharger, InverterState } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { HUB_EDGE, HUB_STRANDS, HUB_VIEW, type HubPort, type HubPorts, type HubSide } from "./hubPorts";

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
const BRANCHES = 3;
// A conduit narrows over FUNNEL units in from the square's edge to its
// strands' width, the strands SPREAD apart, beginning HUB_STRANDS units in.
const FUNNEL = 24;
const SPREAD = 5;
// How many legs of the winding a pulse runs each way from where its strand joins.
const RUN = 6;
const PULSE = 10;

const SIDE_ANGLE: Record<HubSide, number> = { right: 0, bottom: 90, left: 180, top: 270 };

type Point = { x: number; y: number };
const polar = (radius: number, degrees: number): Point => ({
  x: CENTER + radius * Math.cos((degrees * Math.PI) / 180),
  y: CENTER + radius * Math.sin((degrees * Math.PI) / 180),
});
const at = (point: Point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
const arcLength = (radius: number, degrees: number) => (radius * Math.abs(degrees) * Math.PI) / 180;

/** A port's frame: where its conduit meets the square's edge, inward, and across. */
function frame(port: HubPort) {
  const dir = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 } }[port.side];
  const edge = dir.x === 0
    ? { x: CENTER + port.offset, y: CENTER + dir.y * HUB_EDGE }
    : { x: CENTER + dir.x * HUB_EDGE, y: CENTER + port.offset };
  const inward = { x: -dir.x, y: -dir.y };
  const across = { x: Math.abs(inward.y), y: Math.abs(inward.x) };
  // A point `u` in from the edge and `v` across from the conduit's middle.
  return (u: number, v: number): Point => ({
    x: edge.x + inward.x * u + across.x * v,
    y: edge.y + inward.y * u + across.y * v,
  });
}

/** The opening in the square a conduit shows through as it narrows to its strands, ending round. */
function funnel(port: HubPort): string {
  const p = frame(port);
  const wide = port.width / 2 + 0.5;
  const narrow = SPREAD + 2.5;
  return [
    `M${at(p(-2, -wide))} L${at(p(0, -wide))}`,
    `C${at(p(FUNNEL * 0.45, -wide))} ${at(p(FUNNEL * 0.55, -narrow))} ${at(p(FUNNEL, -narrow))}`,
    `A${narrow} ${narrow} 0 0 1 ${at(p(FUNNEL, narrow))}`,
    `C${at(p(FUNNEL * 0.55, narrow))} ${at(p(FUNNEL * 0.45, wide))} ${at(p(0, wide))}`,
    `L${at(p(-2, wide))} Z`,
  ].join(" ");
}

/**
 * The winding, from the middle of an outer turn at `angle`, `legs` legs on
 * round the core one way or the other: on along the outer arc, then in and
 * out across the rings of cells, turn by turn.
 */
function walk(angle: number, way: 1 | -1, legs: number): { d: string; length: number } {
  const first = way > 0 ? angle + STEP / 2 : angle - STEP / 2;
  const sweep = way > 0 ? 1 : 0;
  const parts = [`A${WIND.outer} ${WIND.outer} 0 0 ${sweep} ${at(polar(WIND.outer, first))}`];
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
    const inward = leg % 2 === 0;
    const radius = inward ? WIND.inner : WIND.outer;
    parts.push(`L${at(polar(radius, a))}`);
    parts.push(`A${radius} ${radius} 0 0 1 ${at(polar(radius, a + STEP))}`);
  }
  return `${parts.join(" ")} Z`;
}
const COIL = coil();

/** Where a strand at `angle` joins the winding: the middle of the nearest outer turn. */
function join(angle: number): number {
  // Outer turns run between legs 2m + 1 and 2m + 2.
  const m = Math.round((angle / STEP - 1.5) / 2);
  return (2 * m + 1.5) * STEP;
}

/** A strand from the conduit's narrowed end to where it joins the winding, smoothly. */
function strand(port: HubPort, place: number, angle: number): { d: string; length: number } {
  const p = frame(port);
  const begin = p(HUB_STRANDS, place * SPREAD);
  const inward = p(HUB_STRANDS + 1, place * SPREAD);
  const dir = { x: inward.x - begin.x, y: inward.y - begin.y };
  const end = polar(WIND.outer, angle);
  const out = polar(WIND.outer + 1, angle);
  const radial = { x: out.x - end.x, y: out.y - end.y };
  return {
    d: `M${at(begin)} C${at({ x: begin.x + dir.x * 20, y: begin.y + dir.y * 20 })} ${
      at({ x: end.x + radial.x * 18, y: end.y + radial.y * 18 })} ${at(end)}`,
    length: Math.hypot(end.x - begin.x, end.y - begin.y) * 1.2,
  };
}

/**
 * Each port's strands, three joining the winding on its side, those of two
 * ports sharing a side kept apart, and the paths its pulses take: along a
 * strand and on round the winding each way from where it joins.
 */
function strands(ports: HubPort[]) {
  return ports.map((port, index) => {
    const sharing = ports.filter((other) => other.side === port.side).length;
    const base = SIDE_ANGLE[port.side];
    // A port off its side's middle has its strands turned toward where it meets the side.
    const across = port.side === "left" ? -1 : port.side === "right" ? 1 : port.side === "bottom" ? -1 : 1;
    const center = base + across * ((Math.atan2(port.offset * 1.4, 40) * 180) / Math.PI);
    const apart = sharing > 1 ? 2 * STEP : 4 * STEP;
    // The strands keep their order across the conduit as they fan out round the core.
    const order = port.side === "left" || port.side === "bottom" ? -1 : 1;
    const lines = Array.from({ length: BRANCHES }, (_, n) => {
      const angle = join(center + (n - 1) * apart);
      const line = strand(port, (n - 1) * order, angle);
      const runs = ([1, -1] as const).map((way) => {
        const round = walk(angle, way, RUN);
        return { d: `${line.d} ${round.d}`, length: line.length + round.length };
      });
      return { line, runs };
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
// transformer's. Each conduit that meets it narrows in from the square's edge
// into three strands that join the coil on its side. Pulses pour from a
// supply's conduit into its strands and on round the coil, and from the coil
// out through the strands of what it feeds into their conduits, each conduit's pulses at its own
// pace and timed to its crests, so they flow on from the conduits and back
// out into them. Light chases round the core's cells, clockwise while it
// charges the battery and the other way while it inverts, faster with every
// tenfold increase in power, and the light at the center pulses on its own,
// slow when the unit is quiet and quicker the more power it handles. Idle,
// it is dim and still. The core is tinted by what it is doing, which its
// state also says in words: blue plasma inverting, teal charging, lavender
// passing through.
export function InverterCore({ inverter, hub }: { inverter: InverterCharger; hub?: HubPorts }) {
  const work = duty(inverter);
  const power = Math.max(
    Math.abs(inverter.ac_in_power_w ?? 0),
    Math.abs(inverter.ac_out_power_w ?? 0),
    Math.abs(inverter.dc_power_w ?? 0),
  );
  const speed = flowSpeed(power);
  const wound = strands(hub?.ports ?? []);
  const cycle = hub?.cycleUnits || 250;
  const share = (length: number) => Math.min(0.9, Math.max(0.08, length / cycle));
  const keyframes = wound.map(({ port, index, lines }) =>
    pulseKeyframes(`fof-wind-${index}`, share(Math.max(...lines.flatMap((l) => l.runs.map((r) => r.length)))), port.outward),
  ).join(" ");
  // The square, with an opening where each conduit narrows to its strands;
  // each opening starts a little outside the square, which the square's own
  // outline then clips off, so no seam shows where the conduit meets it.
  const clip = useId();
  const outline = [
    `M${CENTER - HUB_EDGE} ${CENTER - HUB_EDGE + HUB_EDGE / 3}`,
    `A${HUB_EDGE / 3} ${HUB_EDGE / 3} 0 0 1 ${CENTER - HUB_EDGE + HUB_EDGE / 3} ${CENTER - HUB_EDGE}`,
    `L${CENTER + HUB_EDGE - HUB_EDGE / 3} ${CENTER - HUB_EDGE}`,
    `A${HUB_EDGE / 3} ${HUB_EDGE / 3} 0 0 1 ${CENTER + HUB_EDGE} ${CENTER - HUB_EDGE + HUB_EDGE / 3}`,
    `L${CENTER + HUB_EDGE} ${CENTER + HUB_EDGE - HUB_EDGE / 3}`,
    `A${HUB_EDGE / 3} ${HUB_EDGE / 3} 0 0 1 ${CENTER + HUB_EDGE - HUB_EDGE / 3} ${CENTER + HUB_EDGE}`,
    `L${CENTER - HUB_EDGE + HUB_EDGE / 3} ${CENTER + HUB_EDGE}`,
    `A${HUB_EDGE / 3} ${HUB_EDGE / 3} 0 0 1 ${CENTER - HUB_EDGE} ${CENTER + HUB_EDGE - HUB_EDGE / 3} Z`,
  ].join(" ");
  const square = [outline, ...wound.map(({ port }) => funnel(port))].join(" ");

  return (
    <div className={`fof-unit fof-ring-unit fof-duty-${work} fof-flow-${speed}`} data-anchor="hub" aria-hidden="true"
      style={{ "--fof-light": `${lightPeriod(power).toFixed(2)}s` } as CSSProperties}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="fof-unit-art">
        <style>{keyframes}</style>
        <clipPath id={clip}>
          <path d={outline} />
        </clipPath>
        <path className="fof-hub-disc" d={square} fillRule="evenodd" clipPath={`url(#${CSS.escape(clip)})`} />
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
        {wound.map(({ port, lines }) => lines.map(({ line }, n) => (
          <path key={`${port.key}-${n}`} className={`fof-hub-wire${port.idle ? " fof-hub-wire-idle" : ""}`} d={line.d} />
        )))}
        {wound.map(({ port, index, lines }) => !port.idle && lines.flatMap(({ runs }, n) => runs.map((run, way) => {
          // A pulse in leaves the conduit's end as a crest reaches it; one out reaches it as a crest leaves.
          const start = port.outward ? port.crossing - share(run.length) : port.crossing;
          const begin = ((start % 1) + 1) % 1;
          return (
            <path key={`${port.key}-pulse-${n}-${way}`} className="fof-hub-pulse" d={run.d} pathLength="100"
              style={{
                animationName: `fof-wind-${index}`,
                animationDuration: `var(--fof-roll-${port.key}, 4s)`,
                animationDelay: `calc(var(--fof-roll-${port.key}, 4s) * ${(begin - 1).toFixed(3)})`,
              } as CSSProperties} />
          );
        })))}
        <circle className="fof-hub-band" cx={CENTER} cy={CENTER} r={BAND} />
        <circle className="fof-hub-light" cx={CENTER} cy={CENTER} r={LIGHT} />
      </svg>
    </div>
  );
}

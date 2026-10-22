import type { CSSProperties } from "react";

import type { InverterCharger, InverterState } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { HUB_EDGE, HUB_VIEW, type HubPort, type HubPorts, type HubSide } from "./hubPorts";

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
// A winding's turns run across both rings of cells, from just outside the
// core in to just outside the band, and back out to just past the outer ring.
const WIND = { lead: 58, outer: 49, inner: 30 };
const TURNS = 2;
const BRANCHES = 3;
// How far apart the branches leave the conduit's end, across it.
const STRAND = 7;
const PULSE = 10;

const SIDE_ANGLE: Record<HubSide, number> = { right: 0, bottom: 90, left: 180, top: 270 };

type Point = { x: number; y: number };
const polar = (radius: number, degrees: number): Point => ({
  x: CENTER + radius * Math.cos((degrees * Math.PI) / 180),
  y: CENTER + radius * Math.sin((degrees * Math.PI) / 180),
});
const at = (point: Point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;

/**
 * Where a conduit's strand leaves its end at the edge of the hub's square,
 * `strand` places across from its middle, and which way it runs on inward.
 */
function crossing(port: HubPort, strand: number): { point: Point; inward: Point } {
  const dir = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 } }[port.side];
  const across = port.offset + strand * STRAND;
  const point = dir.x === 0
    ? { x: CENTER + across, y: CENTER + dir.y * HUB_EDGE }
    : { x: CENTER + dir.x * HUB_EDGE, y: CENTER + across };
  return { point, inward: { x: -dir.x, y: -dir.y } };
}

/**
 * One branch from where its conduit crosses the disc to a winding round the
 * core at `angle`: a smooth curve in to the core's edge, then turns that run
 * in across the rings of cells and back out, each a little further round,
 * ending at the core's edge again. Its length, near enough, times the pulse.
 */
function branch(port: HubPort, strand: number, angle: number, span: number): { d: string; length: number } {
  const { point, inward } = crossing(port, strand);
  const step = span / (2 * TURNS - 1);
  const angles = Array.from({ length: 2 * TURNS }, (_, leg) => angle - span / 2 + leg * step);
  const lead = polar(WIND.lead, angles[0]!);
  const out = { x: Math.cos((angles[0]! * Math.PI) / 180), y: Math.sin((angles[0]! * Math.PI) / 180) };
  const parts = [
    `M${at(point)}`,
    `C${at({ x: point.x + inward.x * 26, y: point.y + inward.y * 26 })} ${
      at({ x: lead.x + out.x * 22, y: lead.y + out.y * 22 })} ${at(lead)}`,
  ];
  let length = Math.hypot(lead.x - point.x, lead.y - point.y) * 1.2;
  angles.forEach((a, leg) => {
    const inwardLeg = leg % 2 === 0;
    const last = leg === angles.length - 1;
    const end = inwardLeg ? WIND.inner : last ? WIND.lead : WIND.outer;
    parts.push(`L${at(polar(end, a))}`);
    length += Math.abs(end - (inwardLeg ? (leg === 0 ? WIND.lead : WIND.outer) : WIND.inner));
    if (!last) {
      const sweep = step > 0 ? 1 : 0;
      parts.push(`A${end} ${end} 0 0 ${sweep} ${at(polar(end, a + step))}`);
      length += (end * Math.abs(step) * Math.PI) / 180;
    }
  });
  return { d: parts.join(" "), length };
}

/** Each port's windings: three round the core on its side, those of two ports sharing a side kept apart. */
function windings(ports: HubPort[]) {
  return ports.map((port, index) => {
    const sharing = ports.filter((other) => other.side === port.side).length;
    const base = SIDE_ANGLE[port.side];
    // A port off its side's middle has its windings turned toward where it meets the side.
    const across = port.side === "left" ? -1 : port.side === "right" ? 1 : port.side === "bottom" ? -1 : 1;
    const toward = (Math.atan2(port.offset * 1.4, 40) * 180) / Math.PI;
    const center = base + across * toward;
    const apart = sharing > 1 ? 15 : 26;
    // The strands keep their order across the conduit as they fan out round the core.
    const order = port.side === "left" || port.side === "bottom" ? -1 : 1;
    const paths = Array.from({ length: BRANCHES }, (_, n) =>
      branch(port, (n - 1) * order, center + (n - 1) * apart, apart * 0.7));
    return { port, index, paths };
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
// square. Each conduit that meets it runs on under the square, and where it
// meets the square's edge it splits into three branches, each winding round
// the core's rings of cells like a transformer's windings. Pulses come in
// along a supply's branches and through its windings, then out through the
// windings and branches of what it feeds, each conduit's pulses at its own
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
  const wound = windings(hub?.ports ?? []);
  const cycle = hub?.cycleUnits || 250;
  const keyframes = wound.flatMap(({ port, index, paths }) => {
    const longest = Math.max(...paths.map((path) => path.length));
    const share = Math.min(0.9, Math.max(0.08, longest / cycle));
    return [pulseKeyframes(`fof-wind-${index}`, share, port.outward)];
  }).join(" ");

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
        {wound.map(({ port, paths }) => paths.map((path, n) => (
          <path key={`${port.key}-${n}`} className={`fof-hub-wire${port.idle ? " fof-hub-wire-idle" : ""}`} d={path.d} />
        )))}
        {wound.map(({ port, index, paths }) => !port.idle && paths.map((path, n) => {
          const start = port.outward ? port.crossing - Math.min(0.9, Math.max(0.08, path.length / cycle)) : port.crossing;
          const begin = ((start % 1) + 1) % 1;
          return (
            <path key={`${port.key}-pulse-${n}`} className="fof-hub-pulse" d={path.d} pathLength="100"
              style={{
                animationName: `fof-wind-${index}`,
                animationDuration: `var(--fof-roll-${port.key}, 4s)`,
                animationDelay: `calc(var(--fof-roll-${port.key}, 4s) * ${(begin - 1).toFixed(3)})`,
              } as CSSProperties} />
          );
        }))}
        <circle className="fof-hub-band" cx={CENTER} cy={CENTER} r={BAND} />
        <circle className="fof-hub-light" cx={CENTER} cy={CENTER} r={LIGHT} />
      </svg>
    </div>
  );
}

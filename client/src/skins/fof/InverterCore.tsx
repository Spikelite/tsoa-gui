import type { CSSProperties } from "react";

import type { InverterCharger, InverterState } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { BAND, CENTER, COIL, fraction, SIZE, threads } from "./hubGeometry";
import type { HubPorts } from "./hubPorts";

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

const CELLS = 12;
const CELL = { length: 13, depth: 7 };
// The core's two rings of cells, by radius, and the core's own radius.
const TRACKS = [33, 43];
const CORE = 52;
const LIGHT = 22;
const PULSE = 10;

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

// The inverter/charger drawn as a hub that power runs through, its core
// wound all the way round in one even coil like a transformer's. The
// conduits that meet it carry on, on their own layer (HubThreads.tsx), past
// the edge of a dark square under it as threads of themselves that narrow
// into the coil, so the waves pour on from a conduit into the coil, and from
// the coil out into the conduits of what it feeds. Pulses run from where a
// supply's threads join the coil, a few turns round it and in to the core,
// and out of the core, a few turns round and out along the threads of what it
// feeds, each conduit's at its own pace and timed to its crests. Light chases
// round the core's cells, clockwise while it charges the battery and the
// other way while it inverts, faster with every tenfold increase in power,
// and the light at the center pulses on its own, slow when the unit is quiet
// and quicker the more power it handles. Idle, it is dim and still. The core
// is tinted by what it is doing, which its state also says in words: blue
// plasma inverting, teal charging, lavender passing through.
export function InverterCore({ inverter, hub }: { inverter: InverterCharger; hub?: HubPorts }) {
  const work = duty(inverter);
  const power = Math.max(
    Math.abs(inverter.ac_in_power_w ?? 0),
    Math.abs(inverter.ac_out_power_w ?? 0),
    Math.abs(inverter.dc_power_w ?? 0),
  );
  const speed = flowSpeed(power);
  const wound = threads(hub?.ports ?? []);
  const cycle = hub?.cycleUnits || 250;
  const share = (length: number) => Math.min(0.9, Math.max(0.08, length / cycle));
  const keyframes = wound.map(({ port, index, lines }) =>
    pulseKeyframes(`fof-wind-${index}`, share(Math.max(...lines.flatMap((l) => l.runs.map((r) => r.length)))), port.outward),
  ).join(" ");

  return (
    <div className={`fof-unit fof-ring-unit fof-duty-${work} fof-flow-${speed}`} data-anchor="hub" aria-hidden="true"
      style={{ "--fof-light": `${lightPeriod(power).toFixed(2)}s` } as CSSProperties}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="fof-unit-art">
        <style>{keyframes}</style>
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
        {wound.map(({ port, index, lines }) => !port.idle && lines.flatMap((line, n) => line.runs.map((run, way) => {
          // A pulse in sets off from a thread's end as a crest reaches it and
          // runs through the winding to the core; a pulse out leaves the core
          // and reaches a thread's end as a crest leaves it.
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

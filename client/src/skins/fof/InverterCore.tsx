import type { CSSProperties } from "react";

import type { InverterCharger, InverterState } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";

/** What the inverter/charger is doing with power, which tints its ring. */
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

const SIZE = 160;
const CENTER = SIZE / 2;
const CELLS = 16;
const CELL = { length: 15, depth: 8 };
// The two rings of cells, and the ribbed plates around them, by radius.
const TRACKS = [44, 56];
const PLATES = [66, 70, 74, 78];

// The inverter/charger drawn as a ring: the generator's column bent round on
// itself, with ribbed plates around the outside, two rings of cells inside
// them, and a hub at the center. Light chases round the cells, clockwise
// while it charges the battery and the other way while it inverts from it,
// faster with every tenfold increase in power. Passing the supply through, the
// cells hold steady and the hub pulses. Idle, it is dim and still. The hub's
// ring and the light are tinted by what it is doing, which its state also
// says in words: blue plasma inverting, teal charging, lavender passing
// through.
export function InverterCore({ inverter }: { inverter: InverterCharger }) {
  const work = duty(inverter);
  const power = Math.max(
    Math.abs(inverter.ac_in_power_w ?? 0),
    Math.abs(inverter.ac_out_power_w ?? 0),
    Math.abs(inverter.dc_power_w ?? 0),
  );
  const speed = flowSpeed(power);

  return (
    <div className={`fof-unit fof-ring-unit fof-duty-${work} fof-flow-${speed}`} data-anchor aria-hidden="true">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="fof-unit-art">
        {PLATES.map((radius, index) => (
          <circle key={radius} className={`fof-unit-band fof-plate-${index % 2}`} cx={CENTER} cy={CENTER} r={radius} />
        ))}
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
        <circle className="fof-unit-housing" cx={CENTER} cy={CENTER} r="30" />
        <circle className="fof-unit-port" cx={CENTER} cy={CENTER} r="17" />
        <circle className="fof-unit-ring" cx={CENTER} cy={CENTER} r="11" />
      </svg>
    </div>
  );
}

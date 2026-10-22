import type { CSSProperties } from "react";

import type { InverterCharger, InverterState } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";

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

const SIZE = 200;
const CENTER = SIZE / 2;
const CELLS = 12;
const CELL = { length: 13, depth: 7 };
// The core's two rings of cells, and the housing's ribbed bands, by radius.
const TRACKS = [33, 43];
const BANDS = [84, 88, 92, 96];
// The housing's bands leave a port open to the right, below and to the left,
// where the conduits run in to the core: in degrees clockwise from the right,
// as dashes and gaps starting 15 degrees past the right-hand port.
const PORTS = "60 30 60 30 150 30";

// The inverter/charger drawn as a hub that power runs through. Its conduits
// do not stop at its edge: they run on through open ports in its ribbed
// housing to its core, so the waves on them carry on inside, in from where
// the power comes and out to where it goes, each spoke as wide and as fast as
// the flow it carries. Over the junction sits the core, two rings of cells
// round a center, where light chases round, clockwise while it charges the
// battery and the other way while it inverts, faster with every tenfold
// increase in power. Passing the supply through, the cells hold steady and
// the center pulses. Idle, it is dim and still. The core is tinted by what it
// is doing, which its state also says in words: blue plasma inverting, teal
// charging, lavender passing through.
export function InverterCore({ inverter }: { inverter: InverterCharger }) {
  const work = duty(inverter);
  const power = Math.max(
    Math.abs(inverter.ac_in_power_w ?? 0),
    Math.abs(inverter.ac_out_power_w ?? 0),
    Math.abs(inverter.dc_power_w ?? 0),
  );
  const speed = flowSpeed(power);

  return (
    <div className={`fof-unit fof-ring-unit fof-duty-${work} fof-flow-${speed}`} data-anchor="hub" aria-hidden="true">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="fof-unit-art">
        {BANDS.map((radius, index) => (
          <circle key={radius} className={`fof-unit-band fof-plate-${index % 2}`} cx={CENTER} cy={CENTER} r={radius}
            pathLength="360" strokeDasharray={PORTS} strokeDashoffset="-15" />
        ))}
        <circle className="fof-unit-core" cx={CENTER} cy={CENTER} r="52" />
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
        <circle className="fof-unit-housing" cx={CENTER} cy={CENTER} r="22" />
        <circle className="fof-unit-port" cx={CENTER} cy={CENTER} r="13" />
        <circle className="fof-unit-ring" cx={CENTER} cy={CENTER} r="8" />
      </svg>
    </div>
  );
}

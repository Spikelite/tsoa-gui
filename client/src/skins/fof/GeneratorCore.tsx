import type { CSSProperties } from "react";

import type { Generator } from "../../model/system";
import { useCarried, type Along } from "./carry";
import { cableKeyframes, PIP, PIPS, pipKeyframes, ROW_END, ROW_MIDDLE, SCHEMATIC } from "./schematic";

// The column, in its own units: ribbed caps at each end, stacks of cells
// between them, and a housing at its middle.
const WIDTH = 80;
const PLATES = [44, 56, 64, 70, 74, 76];
const PLATE = 7;
const ROWS = 6;
const CELL = { width: 26, height: 8, gap: 2.5 };
const RING = 36;
const CAP = PLATES.length * (PLATE + 2);
const STACK = ROWS * (CELL.height + CELL.gap);
const UPPER = CAP + 2;
const HOUSING = UPPER + STACK + 2;
const LOWER = HOUSING + RING + 4;
const HEIGHT = LOWER + STACK + 2 + CAP;

// The column stands at the drawing's left, scaled to its height.
const SCALE = (SCHEMATIC.height - 4) / HEIGHT;
const LEFT = 10;
const MIDDLE_Y = 2 + SCALE * (HOUSING + RING / 2);
const COLUMN_RIGHT = LEFT + SCALE * WIDTH;

// The cycle, as shares of one wave's time on the conduit: the cells light
// from both ends inward (timed in fof.css), meet in the dot, which pulses;
// the pulse runs down the cable into the row of pips and along it, reaching
// the far end as the cycle closes, just as a wave sets off along the conduit.
const CABLE = [0.62, 0.74] as const;
const KEYFRAMES = [pipKeyframes("fof-gen-pip", CABLE[1]), cableKeyframes("fof-gen-cable", CABLE[0], CABLE[1])].join(" ");
const CABLE_PATH = `M${COLUMN_RIGHT} ${MIDDLE_Y} H${PIP.first - 26} Q${PIP.first - 18} ${MIDDLE_Y} ${PIP.first - 18} ${MIDDLE_Y + 8} V${ROW_MIDDLE - 8} Q${PIP.first - 18} ${ROW_MIDDLE} ${PIP.first - 10} ${ROW_MIDDLE} H${PIP.first - 3}`;

// The generator starts and stops as the cycle that would send a wave starts.
const FEEDS: Along = { keys: ["generator-inverter_charger", "generator-ac_loads"], end: "source" };

// The generator drawn as a schematic of a supply, as the grid's and solar's
// are: a column at the left, as the console draws a reactor, with ribbed caps
// at each end, stacks of cells between them, and at its middle a dark housing
// holding a lighter ring round a dot; a cable from the dot down to a row of
// pips along the bottom, where the conduit to the inverter/charger sets off;
// and the generator's readings in the space above the row. While it runs,
// blue light runs through the cells from both ends in to the middle, meets in
// the dot and pulses there, then runs down the cable, along the pips and into
// the conduit just as a wave sets off along it, at the conduit's pace;
// stopped, it is dim and still.
export function GeneratorCore({ generator }: { generator: Generator }) {
  const running = useCarried(generator.status !== "offline" && generator.running === true, FEEDS);

  const stack = (top: number, inward: (row: number) => number) =>
    Array.from({ length: ROWS }, (_, row) => {
      const y = top + row * (CELL.height + CELL.gap);
      return [WIDTH / 2 - CELL.width - 2, WIDTH / 2 + 2].map((x) => (
        <rect key={`${row}-${x}`} className="fof-unit-cell" x={x} y={y} width={CELL.width} height={CELL.height}
          rx={CELL.height / 2} style={{ "--wave": inward(row), "--waves": ROWS } as CSSProperties} />
      ));
    });

  const cap = (top: number, downward: boolean) =>
    PLATES.map((width, index) => {
      const y = downward ? top + index * (PLATE + 2) : top + (PLATES.length - 1 - index) * (PLATE + 2);
      return (
        <rect key={index} className={`fof-unit-plate fof-plate-${index % 2}`} x={(WIDTH - width) / 2} y={y}
          width={width} height={PLATE} rx={PLATE / 2} />
      );
    });

  return (
    <div className={`fof-unit fof-schematic-unit fof-gen-unit ${running ? "fof-duty-running" : "fof-duty-idle"}`}
      aria-hidden="true">
      <svg viewBox={`0 0 ${SCHEMATIC.width} ${SCHEMATIC.height}`} className="fof-unit-art">
        <style>{KEYFRAMES}</style>
        <path className="fof-schematic-lead" d={CABLE_PATH} />
        <path className="fof-cable-pulse fof-gen-pulse" d={CABLE_PATH} pathLength="100" />
        <g transform={`translate(${LEFT} 2) scale(${SCALE})`}>
          {cap(0, true)}
          {stack(UPPER, (row) => row)}
          <rect className="fof-gen-housing" x="0" y={HOUSING} width={WIDTH} height={RING} rx="8" />
          <circle className="fof-gen-ring" cx={WIDTH / 2} cy={HOUSING + RING / 2} r="14" />
          <circle className="fof-gen-dot" cx={WIDTH / 2} cy={HOUSING + RING / 2} r="8" />
          {stack(LOWER, (row) => ROWS - 1 - row)}
          {cap(LOWER + STACK + 2, false)}
        </g>
        {Array.from({ length: PIPS }, (_, pip) => (
          <rect key={pip} className="fof-tower-pill fof-gen-pip" x={PIP.first + pip * PIP.pitch} y={PIP.top}
            width={PIP.width} height={PIP.height} rx={PIP.width / 2}
            style={{ "--pip": `fof-gen-pip-${pip}` } as CSSProperties} />
        ))}
      </svg>
      {/* Where the conduit to the inverter/charger sets off: the row of pips, from its far end. */}
      <span className="fof-schematic-launch" data-anchor="launch" style={{
        left: `${(PIP.first / SCHEMATIC.width) * 100}%`,
        width: `${((ROW_END - PIP.first) / SCHEMATIC.width) * 100}%`,
        top: `${(PIP.top / SCHEMATIC.height) * 100}%`,
        height: `${(PIP.height / SCHEMATIC.height) * 100}%`,
      }} />
    </div>
  );
}

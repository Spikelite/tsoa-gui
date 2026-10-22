import type { CSSProperties } from "react";

import type { Grid } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";

const WIDTH = 400;
const HEIGHT = 180;

// The row of pills along the bottom, which the grid's conduit leaves from at
// its right-hand end.
const PILLS = 14;
const PILL = { width: 13, height: 34, pitch: 19, first: 130, top: 140 };
const ROW_END = PILL.first + (PILLS - 1) * PILL.pitch + PILL.width;
const ROW_MIDDLE = PILL.top + PILL.height / 2;

// The tower's members, drawn as outlined tubes; its lattice, in thin lines.
const MEMBERS = [
  "M12 176 L40 72 L46 30 L50 6 L54 30 L60 72 L88 176",
  "M4 32 H96",
  "M14 72 H86",
  "M28 118 H72",
];
const LATTICE = [
  "M17 158 L76 176 M83 158 L24 176",
  "M22 138 L80 158 M78 138 L20 158",
  "M28 118 L78 138 M72 118 L22 138",
  "M33 96 L70 118 M67 96 L30 118",
  "M38 72 L64 96 M62 72 L36 96",
  "M41 50 L59 72 M59 50 L41 72",
  "M45 32 L56 50 M55 32 L44 50",
];
const INSULATORS: [number, number][] = [[8, 32], [92, 32], [18, 72], [82, 72]];

// Each cycle of a pip, as shares of the wave's cycle: the pips fill one after
// another until the row is full, then a pulse runs down the full row, emptying
// each pip as it passes, and reaches the far end at the cycle's close, just as
// a wave sets off along the conduit.
const FILL_END = 0.7;
const PULSE_START = 0.74;
const PULSE_END = 0.98;

/** The keyframes for one pip, by its place in the row. */
function drip(index: number): string {
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
  const filling = (FILL_END * index) / PILLS;
  const full = (FILL_END * (index + 1)) / PILLS;
  const pulse = PULSE_START + ((PULSE_END - PULSE_START) * index) / (PILLS - 1);
  return `@keyframes fof-drip-${index} {
    0%, ${percent(filling)} { fill: var(--fof-drip-empty); }
    ${percent(full)}, ${percent(pulse - 0.01)} { fill: var(--fof-drip-full); }
    ${percent(pulse)} { fill: var(--fof-drip-hot); }
    ${percent(Math.min(pulse + 0.04, 1))}, 100% { fill: var(--fof-drip-empty); }
  }`;
}

const DRIPS = Array.from({ length: PILLS }, (_, index) => drip(index)).join(" ");

// The grid drawn as a schematic of a supply, in the console's way of showing
// equipment: a tall lattice transmission tower in outline, its wire running
// down to a row of pips along the bottom, and the grid's conduit leaving
// from the row's far end, with the grid's readings in the space above the
// row. While power comes in from the grid it drips off the wire: the first
// pip charges, then the next, and the next, until the row is full, and then a
// pulse runs down the row and into the conduit, timed to set off along it
// with a wave, and the row starts filling again. With nothing coming in, the
// row is dim and still.
export function GridTower({ grid }: { grid: Grid }) {
  const power = grid.power_w ?? 0;
  const feeding = grid.status !== "offline" && grid.connected !== false && power > 0;
  const speed = flowSpeed(power);

  return (
    <div className={`fof-unit fof-tower-unit ${feeding ? "fof-duty-feeding" : "fof-duty-idle"} fof-speed-${speed}`}
      aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="fof-unit-art">
        <style>{DRIPS}</style>
        {MEMBERS.map((member) => <path key={member} className="fof-schematic-outline" d={member} />)}
        {MEMBERS.map((member) => <path key={member} className="fof-schematic-core" d={member} />)}
        {LATTICE.map((brace) => <path key={brace} className="fof-schematic-line" d={brace} />)}
        {INSULATORS.map(([x, y]) => (
          <rect key={`${x}-${y}`} className="fof-schematic-insulator" x={x - 3} y={y + 2} width="6" height="12" rx="3" />
        ))}
        <path className="fof-schematic-lead"
          d={`M92 46 H104 Q112 46 112 54 V${ROW_MIDDLE - 8} Q112 ${ROW_MIDDLE} 120 ${ROW_MIDDLE} H${PILL.first - 3}`} />
        <circle className="fof-schematic-dot" cx="92" cy="46" r="3" />
        {Array.from({ length: PILLS }, (_, index) => (
          <rect key={index} className="fof-tower-pill" x={PILL.first + index * PILL.pitch} y={PILL.top}
            width={PILL.width} height={PILL.height} rx={PILL.width / 2}
            style={{ "--drip": `fof-drip-${index}` } as CSSProperties} />
        ))}
      </svg>
      {/* Where the grid's conduit leaves: the row of pills, from its far end. */}
      <span className="fof-tower-row" data-anchor="launch" style={{
        left: `${(PILL.first / WIDTH) * 100}%`,
        width: `${((ROW_END - PILL.first) / WIDTH) * 100}%`,
        top: `${(PILL.top / HEIGHT) * 100}%`,
        height: `${(PILL.height / HEIGHT) * 100}%`,
      }} />
    </div>
  );
}

import type { CSSProperties } from "react";

import type { Grid } from "../../model/system";

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

// The drip, over one wave's cycle. The pips rest in the conduit's yellow.
// The first turns steadily blue until it is full, then the second, then the
// third; before the third is full, the charge sets off down the row as a
// packet of blue and the first pip goes back to yellow to start the next.
// The packet reaches the row's far end at the close of the cycle, just as a
// wave sets off along the conduit, so it moves at close to the conduit's own
// speed and the next packet sets off as it arrives.
const CHARGING = 0.4;
const PACKET = 2.5;
const SAMPLES = 40;

/** How blue a pip is at a point in the cycle, from 0 (yellow) to 1. */
function blueness(pip: number, time: number): number {
  const charge = Math.max(0, Math.min(1, (time - pip * CHARGING) / CHARGING));
  // The packet's leading edge, in pips, from where it set off to the far end.
  const lead = PACKET + (PILLS - PACKET) * time;
  const middle = pip + 0.5;
  const inside = Math.min(middle - (lead - PACKET), lead - middle);
  const packet = Math.max(0, Math.min(1, inside * 2 + 0.5));
  return pip < PACKET ? Math.max(charge, packet) : packet;
}

/** The keyframes for one pip, by its place in the row. */
function drip(pip: number): string {
  const stops = Array.from({ length: SAMPLES + 1 }, (_, step) => {
    const time = step / SAMPLES;
    const blue = Math.round(blueness(pip, time) * 100);
    const at = (time * 100).toFixed(1);
    return `${at}% { fill: color-mix(in oklab, var(--fof-drip-blue) ${blue}%, var(--fof-drip-yellow)); }`;
  });
  return `@keyframes fof-drip-${pip} { ${stops.join(" ")} }`;
}

const DRIPS = Array.from({ length: PILLS }, (_, pip) => drip(pip)).join(" ");

// The grid drawn as a schematic of a supply, in the console's way of showing
// equipment: a tall lattice transmission tower in outline, its wire running
// down to a row of pips along the bottom, and the grid's conduit leaving
// from the row's far end, with the grid's readings in the space above the
// row. While power comes in from the grid it drips off the wire, charging the
// pips nearest it until the charge sets off down the row and into the
// conduit, as drip() describes. With nothing coming in, the row is dim and
// still.
export function GridTower({ grid }: { grid: Grid }) {
  const power = grid.power_w ?? 0;
  const feeding = grid.status !== "offline" && grid.connected !== false && power > 0;

  return (
    <div className={`fof-unit fof-tower-unit ${feeding ? "fof-duty-feeding" : "fof-duty-idle"}`}
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

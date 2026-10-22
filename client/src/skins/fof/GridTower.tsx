import type { CSSProperties } from "react";

import type { Grid } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";

const WIDTH = 260;
const HEIGHT = 120;
// The row of pills the wire comes down to, which the grid's conduit leaves
// from at its right-hand end.
const PILLS = 8;
const PILL = { width: 13, height: 38, pitch: 19, first: 104, top: 64 };
const ROW_END = PILL.first + (PILLS - 1) * PILL.pitch + PILL.width;

// Where the tower's legs, crossarms and bracing run, in the drawing's units.
const LEGS = "M14 118 L38 22 L45 6 L52 22 L76 118";
const ARMS = ["M6 24 H84", "M14 42 H76"];
const BRACING = ["M20 94 L68 118 M70 94 L22 118", "M25 72 L64 94 M65 72 L26 94", "M30 52 L60 72 M60 52 L30 72", "M35 42 L55 52 M55 42 L35 52"];
const INSULATORS = [10, 80, 18, 72];

/**
 * How long before the wave leaves the row's far end it passes a point this
 * share of the way along the row, as a share of the wave's cycle. The wave
 * covers the row in one cycle with steadily rising speed, its distance going
 * as the square of the time, so it reaches the far end at twice its average
 * speed, which for a row this long is close to the conduit's own.
 */
function lead(along: number): number {
  return 1 - Math.sqrt(along);
}

// The grid drawn as the console would draw a supply: a steel lattice
// transmission tower, its wire running down to a row of pills, and the grid's
// conduit leaving from the row's far end. While power comes in from the grid,
// a wave of plasma forms at the front of the row, where the wire lands, and
// builds along it, slowly at first and faster as it goes, reaching the far end
// at the conduit's own speed just as a wave sets off along the conduit, which
// fof.css times. With nothing coming in, the row is dim and still.
export function GridTower({ grid }: { grid: Grid }) {
  const power = grid.power_w ?? 0;
  const feeding = grid.status !== "offline" && grid.connected !== false && power > 0;
  const speed = flowSpeed(power);

  return (
    <div className={`fof-unit fof-tower-unit ${feeding ? "fof-duty-feeding" : "fof-duty-idle"} fof-speed-${speed}`}
      aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="fof-unit-art">
        <path className="fof-tower-steel" d={LEGS} />
        {ARMS.map((arm) => <path key={arm} className="fof-tower-steel" d={arm} />)}
        {BRACING.map((brace) => <path key={brace} className="fof-tower-brace" d={brace} />)}
        {INSULATORS.map((x, index) => {
          const y = index < 2 ? 24 : 42;
          return <path key={index} className="fof-tower-insulator" d={`M${x} ${y} V${y + 9}`} />;
        })}
        <path className="fof-tower-wire" d={`M84 33 Q${PILL.first - 30} 36 ${PILL.first - 4} ${PILL.top + PILL.height / 2}`} />
        {Array.from({ length: PILLS }, (_, index) => (
          <rect key={index} className="fof-tower-pill" x={PILL.first + index * PILL.pitch} y={PILL.top}
            width={PILL.width} height={PILL.height} rx={PILL.width / 2}
            style={{ "--lead": lead(index / (PILLS - 1)).toFixed(3) } as CSSProperties} />
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

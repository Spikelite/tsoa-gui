import type { CSSProperties } from "react";

import type { Solar } from "../../model/system";
import { cableKeyframes, percent, PIP, PIPS, pipKeyframes, ROW_END, ROW_MIDDLE, SCHEMATIC } from "./schematic";

const { width: WIDTH, height: HEIGHT } = SCHEMATIC;
// The array: two rows of two panels, each three cells by three.
const PANEL = { width: 54, height: 50, gap: 6, left: 6, top: 8 };
const CELLS = 3;

const PANELS = [0, 1].flatMap((row) => [0, 1].map((column) => ({
  x: PANEL.left + column * (PANEL.width + PANEL.gap),
  y: PANEL.top + row * (PANEL.height + PANEL.gap),
  // How far the panel is from the array's output, at its bottom right, in panels.
  distance: (1 - row) + (1 - column),
})));
const ARRAY_RIGHT = PANEL.left + 2 * PANEL.width + PANEL.gap;
const ARRAY_BOTTOM = PANEL.top + 2 * PANEL.height + PANEL.gap;

// The cycle, as shares of one wave's time on the conduit. Light gathers in
// every cell of every panel, each cell at its own pace, until the array is
// full; the panels give it up in turn, the furthest from the output first; it
// runs down the cable as one pulse, drops into the row of pips and runs along
// them, reaching the far end as the cycle closes, just as a wave sets off
// along the conduit.
const GATHERED = 0.55;
const RELEASE = 0.62;
const CABLE = [0.7, 0.8] as const;

/** A cell's own pace: when it starts to fill, spread over the first part of the cycle. */
function start(panel: number, cell: number): number {
  return ((panel * 7 + cell * 5) % 11) / 11 * 0.3;
}

function cellKeyframes(panel: number, distance: number, cell: number): string {
  const release = RELEASE + distance * 0.025;
  return `@keyframes fof-gather-${panel}-${cell} {
    0%, ${percent(start(panel, cell))} { fill: var(--fof-solar-dark); }
    ${percent(GATHERED)}, ${percent(release)} { fill: var(--fof-solar-lit); }
    ${percent(release + 0.06)}, 100% { fill: var(--fof-solar-dark); }
  }`;
}

const KEYFRAMES = [
  ...PANELS.flatMap((panel, index) =>
    Array.from({ length: CELLS * CELLS }, (_, cell) => cellKeyframes(index, panel.distance, cell))),
  pipKeyframes("fof-solar-pip", CABLE[1]),
  cableKeyframes("fof-solar-cable", CABLE[0], CABLE[1]),
].join(" ");

const CABLE_PATH = `M${ARRAY_RIGHT - 8} ${ARRAY_BOTTOM} V${ROW_MIDDLE - 8} Q${ARRAY_RIGHT - 8} ${ROW_MIDDLE} ${ARRAY_RIGHT} ${ROW_MIDDLE} H${PIP.first - 3}`;

// The solar chargers drawn as a schematic of an array, in the console's way of
// showing equipment: four panels in outline, each a grid of cells, with a
// cable down to a row of pips, as the grid's tower has, where the conduit to
// the battery sets off, and the solar readings in the space above the row.
// While the sun is on it, light gathers in each cell until the array is full,
// then runs down the cable as one pulse, drops into the pips and runs along
// them into the conduit, timed to set off along it with a wave, at the
// conduit's pace as fof.css sets it. With nothing produced, the array is dark
// and still.
export function SolarArray({ solar }: { solar: Solar }) {
  const producing = solar.status !== "offline" && (solar.power_w ?? 0) > 0;
  const cell = { width: PANEL.width / CELLS, height: PANEL.height / CELLS };

  return (
    <div className={`fof-unit fof-schematic-unit fof-solar-unit ${producing ? "fof-duty-producing" : "fof-duty-idle"}`}
      aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="fof-unit-art">
        <style>{KEYFRAMES}</style>
        <path className="fof-schematic-line"
          d={`M${ARRAY_RIGHT / 2} ${ARRAY_BOTTOM} V${HEIGHT - 4} M${ARRAY_RIGHT / 2 - 18} ${HEIGHT - 4} H${ARRAY_RIGHT / 2 + 18}`} />
        {PANELS.map((panel, index) => (
          <g key={index}>
            {Array.from({ length: CELLS * CELLS }, (_, place) => (
              <rect key={place} className="fof-solar-cell" x={panel.x + (place % CELLS) * cell.width}
                y={panel.y + Math.floor(place / CELLS) * cell.height} width={cell.width} height={cell.height}
                style={{ "--gather": `fof-gather-${index}-${place}` } as CSSProperties} />
            ))}
            {[1, 2].map((line) => (
              <path key={line} className="fof-schematic-line"
                d={`M${panel.x + line * cell.width} ${panel.y} V${panel.y + PANEL.height} M${panel.x} ${panel.y + line * cell.height} H${panel.x + PANEL.width}`} />
            ))}
            <rect className="fof-solar-panel" x={panel.x} y={panel.y} width={PANEL.width} height={PANEL.height} rx="3" />
          </g>
        ))}
        <path className="fof-schematic-lead" d={CABLE_PATH} />
        <path className="fof-cable-pulse fof-solar-pulse" d={CABLE_PATH} pathLength="100" />
        {Array.from({ length: PIPS }, (_, pip) => (
          <rect key={pip} className="fof-tower-pill fof-solar-pip" x={PIP.first + pip * PIP.pitch} y={PIP.top}
            width={PIP.width} height={PIP.height} rx={PIP.width / 2}
            style={{ "--pip": `fof-solar-pip-${pip}` } as CSSProperties} />
        ))}
      </svg>
      {/* Where the conduit to the battery sets off: the row of pips, from its far end. */}
      <span className="fof-schematic-launch" data-anchor="launch" style={{
        left: `${(PIP.first / WIDTH) * 100}%`,
        width: `${((ROW_END - PIP.first) / WIDTH) * 100}%`,
        top: `${(PIP.top / HEIGHT) * 100}%`,
        height: `${(PIP.height / HEIGHT) * 100}%`,
      }} />
    </div>
  );
}

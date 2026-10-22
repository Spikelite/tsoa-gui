import type { CSSProperties } from "react";

import type { Generator } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";

const WIDTH = 80;
const PLATES = [44, 56, 64, 70, 74, 76];
const PLATE = 7;
const ROWS = 6;
const CELL = { width: 26, height: 8, gap: 2.5 };
const RING = 36;

// Where each piece sits, from the top: the upper cap, the upper cells, the
// ring's housing, the lower cells and the lower cap.
const CAP = PLATES.length * (PLATE + 2);
const STACK = ROWS * (CELL.height + CELL.gap);
const UPPER = CAP + 2;
const HOUSING = UPPER + STACK + 2;
const LOWER = HOUSING + RING + 4;
const HEIGHT = LOWER + STACK + 2 + CAP;

// The generator drawn as a column, as the console draws a reactor: ribbed
// caps at each end, stacks of cells between them, and a ring in a housing at
// its middle, where its conduit plugs in. While it runs, light runs through
// the cells from both ends in to the ring, faster with every tenfold increase
// in power; stopped, it is dim and still.
export function GeneratorCore({ generator }: { generator: Generator }) {
  const running = generator.status !== "offline" && generator.running === true;
  const speed = flowSpeed(Math.abs(generator.power_w ?? 0));

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
    <div className={`fof-unit fof-column-unit ${running ? "fof-duty-running" : "fof-duty-idle"} fof-flow-${speed}`}
      data-anchor aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="fof-unit-art">
        {cap(0, true)}
        {stack(UPPER, (row) => row)}
        <rect className="fof-unit-housing" x="0" y={HOUSING} width={WIDTH} height={RING} rx="8" />
        <circle className="fof-unit-port" cx={WIDTH / 2} cy={HOUSING + RING / 2} r="14" />
        <circle className="fof-unit-ring" cx={WIDTH / 2} cy={HOUSING + RING / 2} r="9" />
        {stack(LOWER, (row) => ROWS - 1 - row)}
        {cap(LOWER + STACK + 2, false)}
      </svg>
    </div>
  );
}

import type { CSSProperties } from "react";

import type { AcLoads } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";

const WIDTH = 240;
const HEIGHT = 124;
const BUS = HEIGHT / 2;
// The bus runs from the panel's left edge to its terminal block; the conduit
// feeding the panel runs on along it to there.
const BUS_END = 216;
const BREAKERS = 6;
const BREAKER = { width: 22, height: 26, pitch: 32, first: 22 };
// The clear band either side of the bus, wide enough for the conduit on it.
const CLEAR = 16;

// The AC loads drawn as a circuit panel, in the console's way of drawing
// wiring: a bus that the conduit from the inverter/charger runs on along, so
// its waves carry on inside, with a terminal block at its end, and two rows
// of breakers tapped off it above and below. The model has the loads' total
// rather than each circuit's, so the breakers show the panel at work rather
// than which circuit draws what: while power flows, each wave of plasma on
// the bus flows into each breaker's tap as it passes and lights the breaker,
// as fof.css times them; with nothing drawn, the panel is dim and still.
export function LoadPanel({ loads }: { loads: AcLoads }) {
  const power = Math.abs(loads.power_w ?? 0);
  const working = loads.status !== "offline" && power > 0;
  const speed = flowSpeed(power);

  const row = (above: boolean) =>
    Array.from({ length: BREAKERS }, (_, index) => {
      const x = BREAKER.first + index * BREAKER.pitch;
      const y = above ? BUS - CLEAR - 10 - BREAKER.height : BUS + CLEAR + 10;
      const tap = above ? [y + BREAKER.height, BUS - CLEAR] : [BUS + CLEAR, y];
      const number = String(index * 2 + (above ? 1 : 2)).padStart(2, "0");
      // How far the tap is from the bus's end, as a share of the panel's width.
      const share = { "--tap": ((BUS_END - x - BREAKER.width / 2) / WIDTH).toFixed(3) } as CSSProperties;
      return (
        <g key={`${above}-${index}`} style={share}>
          <line className="fof-panel-tap" x1={x + BREAKER.width / 2} y1={tap[0]} x2={x + BREAKER.width / 2} y2={tap[1]} />
          <rect className="fof-panel-breaker" x={x} y={y} width={BREAKER.width} height={BREAKER.height}
            rx={BREAKER.width / 2} />
          <text className="fof-panel-number" x={x + BREAKER.width / 2} y={y + BREAKER.height / 2}>
            {number}
          </text>
        </g>
      );
    });

  return (
    <div className={`fof-unit fof-panel-unit ${working ? "fof-duty-loaded" : "fof-duty-idle"} fof-speed-${speed}`}
      aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="fof-unit-art">
        <rect className="fof-panel-rail" x="0" y="2" width={WIDTH} height="6" rx="3" />
        <rect className="fof-panel-rail" x="0" y={HEIGHT - 8} width={WIDTH} height="6" rx="3" />
        {row(true)}
        {row(false)}
        <rect className="fof-panel-terminal" x={BUS_END} y={BUS - CLEAR - 6} width={WIDTH - BUS_END} height={(CLEAR + 6) * 2}
          rx="10" />
      </svg>
      {/* Where the feeding conduit ends: the length of the bus, at its height. */}
      <span className="fof-panel-bus" data-anchor="bus" style={{ width: `${(BUS_END / WIDTH) * 100}%` }} />
    </div>
  );
}

import { useRef } from "react";

import type { Flow } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { conduitPath, usePanelBoxes } from "../panelBoxes";

// The gradient's id is fixed so fof.css can color its stops, and a page shows
// one skin at a time.
const PLASMA_ID = "fof-plasma";
/** How fast pulses travel at each step of flowSpeed, in pixels a second. */
const TRAVEL = [35, 55, 85, 130, 200];
/** How far apart a conduit's pulses travel, in pixels. */
const SPACING = 260;
/** A pulse is a train of soft glows this many pixels apart, brightest in its middle. */
const STEP = 4;
const TRAIN = [0.3, 0.55, 0.8, 0.95, 1, 0.95, 0.8, 0.55, 0.3];
/** How far a pulse's route runs under each panel, so it emerges rather than appears. */
const TUCK = 30;

// Power moving between panels, drawn as the console's thick conduits, in right
// angles with rounded elbows, plugged into the panels' edges. Pulses of plasma
// travel along each toward its target, faster and the conduit wider with
// every tenfold increase in power; that motion shows the direction. A pulse
// is a train of round glows, each with a gradient falloff, riding the route
// one behind another, so it bends around the elbows and stays inside the
// conduit, and costs far less than a blur would on a small panel. With motion
// turned off, a chevron in the middle shows the direction instead.
export function Conduits({ flows }: { flows: Flow[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const boxes = usePanelBoxes(svg, flows);

  return (
    <svg ref={svg} className="fof-conduits" aria-hidden="true">
      <defs>
        <radialGradient id={PLASMA_ID}>
          <stop className="fof-plasma-core" offset="0" />
          <stop className="fof-plasma-body" offset="0.35" />
          <stop className="fof-plasma-fringe" offset="0.7" />
          <stop className="fof-plasma-edge" offset="1" />
        </radialGradient>
      </defs>
      {flows.map((flow) => {
        const from = boxes[flow.source];
        const to = boxes[flow.target];
        if (from === undefined || to === undefined) {
          return null;
        }
        const speed = flowSpeed(flow.power_w);
        const { d, middle, angle } = conduitPath(from, to, 36);
        const route = conduitPath(from, to, 36, TUCK);
        const duration = route.length / TRAVEL[speed]!;
        const pulses = Math.max(1, Math.round(route.length / SPACING));
        // Every glow starts before the page did, a whole lap back, so none waits at the origin to begin.
        const begin = (pulse: number, place: number) =>
          `${(((place * STEP) / TRAVEL[speed]! - (pulse * duration) / pulses) - duration).toFixed(2)}s`;
        return (
          <g key={`${flow.source}-${flow.target}`} className={`fof-conduit fof-speed-${speed}`}
            data-flow={`${flow.source}-${flow.target}`}>
            <path className="fof-conduit-body" d={d} />
            {Array.from({ length: pulses }, (_, pulse) =>
              TRAIN.map((opacity, place) => (
                <circle key={`${pulse}-${place}`} className="fof-conduit-pulse" r={8} opacity={opacity}
                  fill={`url(#${PLASMA_ID})`}>
                  <animateMotion path={route.d} dur={`${duration.toFixed(2)}s`} begin={begin(pulse, place)}
                    repeatCount="indefinite" />
                </circle>
              )),
            )}
            <path className="fof-conduit-chevron" d="M-5 -6 L3 0 L-5 6"
              transform={`translate(${middle.x} ${middle.y}) rotate(${angle})`} />
          </g>
        );
      })}
    </svg>
  );
}

import { useRef, type CSSProperties } from "react";

import type { Flow } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { conduitPath, usePanelBoxes } from "../panelBoxes";

// A wave is these faint strokes centered on one another, each shorter, a
// deeper blue and a little stronger than the one under it, so the wave flares
// out from a deep blue middle into the conduit's yellow. Lengths are in em,
// out of the 7em between waves; depth runs from fof.css's icy blue (0) to its
// deep blue (1).
const LAYERS = [
  { length: 6.2, depth: 0, alpha: 0.07 },
  { length: 5, depth: 0, alpha: 0.08 },
  { length: 4, depth: 0.1, alpha: 0.09 },
  { length: 3.2, depth: 0.2, alpha: 0.11 },
  { length: 2.5, depth: 0.35, alpha: 0.13 },
  { length: 1.9, depth: 0.5, alpha: 0.16 },
  { length: 1.4, depth: 0.65, alpha: 0.2 },
  { length: 1, depth: 0.8, alpha: 0.25 },
  { length: 0.65, depth: 0.9, alpha: 0.3 },
  { length: 0.35, depth: 1, alpha: 0.35 },
];

// Power moving between panels, drawn as the console's thick conduits, in right
// angles with rounded elbows, plugged into the panels' edges. Waves of plasma
// roll along each toward its target, faster and the conduit wider with every
// tenfold increase in power; that motion shows the direction. With motion
// turned off, a chevron in the middle shows the direction instead.
export function Conduits({ flows }: { flows: Flow[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const boxes = usePanelBoxes(svg, flows);

  return (
    <svg ref={svg} className="fof-conduits" aria-hidden="true">
      {flows.map((flow) => {
        const from = boxes[flow.source];
        const to = boxes[flow.target];
        if (from === undefined || to === undefined) {
          return null;
        }
        const speed = flowSpeed(flow.power_w);
        const { d, middle, angle } = conduitPath(from, to, 36);
        return (
          <g key={`${flow.source}-${flow.target}`} className={`fof-conduit fof-speed-${speed}`}
            data-flow={`${flow.source}-${flow.target}`}>
            <path className="fof-conduit-body" d={d} />
            {LAYERS.map((layer, index) => (
              <path key={index} className="fof-conduit-wave" d={d}
                style={{ "--length": `${layer.length}em`, "--depth": layer.depth, "--alpha": layer.alpha } as CSSProperties} />
            ))}
            <path className="fof-conduit-chevron" d="M-5 -6 L3 0 L-5 6"
              transform={`translate(${middle.x} ${middle.y}) rotate(${angle})`} />
          </g>
        );
      })}
    </svg>
  );
}

import { useRef } from "react";

import type { Flow } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { conduitPath, usePanelBoxes } from "../panelBoxes";

/** Each wave is this many faint strokes; fof.css gives each its length. */
const LAYERS = 6;

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
            {Array.from({ length: LAYERS }, (_, layer) => (
              <path key={layer} className={`fof-conduit-wave fof-wave-${layer}`} d={d} />
            ))}
            <path className="fof-conduit-chevron" d="M-5 -6 L3 0 L-5 6"
              transform={`translate(${middle.x} ${middle.y}) rotate(${angle})`} />
          </g>
        );
      })}
    </svg>
  );
}

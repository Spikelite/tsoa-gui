import { useRef } from "react";

import type { Flow } from "../../model/system";
import { flowPoints, usePanelBoxes } from "../panelBoxes";
import { flowSpeed } from "./flowSpeed";

// Lines between the centers of the panels, drawn underneath them, so only
// the stretch between two panels shows. Their moving dashes show the
// direction; with motion turned off, minimal.css puts this marker on them
// instead. Its id is fixed so the stylesheet can name it, and a page shows one
// skin at a time.
export const ARROW_ID = "minimal-flow-arrow";

export function Flows({ flows }: { flows: Flow[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const boxes = usePanelBoxes(svg, flows);

  return (
    <svg ref={svg} className="flows" aria-hidden="true">
      <defs>
        <marker id={ARROW_ID} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4"
          orient="auto" markerUnits="strokeWidth">
          <path d="M0 0L10 5L0 10z" fill="currentColor" />
        </marker>
      </defs>
      {flows.map((flow) => {
        const from = boxes[flow.source];
        const to = boxes[flow.target];
        if (from === undefined || to === undefined) {
          return null;
        }
        const speed = flowSpeed(flow.power_w);
        return (
          <polyline
            key={`${flow.source}-${flow.target}`}
            className={`flow flow-speed-${speed}`}
            data-flow={`${flow.source}-${flow.target}`}
            points={flowPoints(from, to)}
            strokeWidth={2 + speed}
          />
        );
      })}
    </svg>
  );
}

import { useId, useLayoutEffect, useRef, useState } from "react";

import type { Flow } from "../../model/system";
import { flowSpeed } from "./flowSpeed";

type Point = { x: number; y: number };

// Lines between the centers of the panels, drawn underneath them, so only
// the stretch between two panels shows. Each carries an arrow at its middle
// that shows the direction even when motion is turned off. The panels are
// found in the element that holds this one: a parent's own ref is not yet
// set when its child's layout effect runs.
export function Flows({ flows }: { flows: Flow[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [centers, setCenters] = useState<Partial<Record<string, Point>>>({});
  const arrow = useId();
  const layoutKey = [...new Set(flows.flatMap((flow) => [flow.source, flow.target]))].sort().join(",");

  useLayoutEffect(() => {
    const root = svg.current?.parentElement;
    if (!root) {
      return;
    }
    const measure = () => {
      const origin = root.getBoundingClientRect();
      const next: Record<string, Point> = {};
      root.querySelectorAll<HTMLElement>("[data-part]").forEach((panel) => {
        const box = panel.getBoundingClientRect();
        next[panel.dataset.part ?? ""] = {
          x: box.left - origin.left + box.width / 2,
          y: box.top - origin.top + box.height / 2,
        };
      });
      setCenters(next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll("[data-part]").forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, [layoutKey]);

  return (
    <svg ref={svg} className="flows" aria-hidden="true">
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4"
          orient="auto" markerUnits="strokeWidth">
          <path d="M0 0L10 5L0 10z" fill="currentColor" />
        </marker>
      </defs>
      {flows.map((flow) => {
        const from = centers[flow.source];
        const to = centers[flow.target];
        if (from === undefined || to === undefined) {
          return null;
        }
        const speed = flowSpeed(flow.power_w);
        const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        return (
          <polyline
            key={`${flow.source}-${flow.target}`}
            className={`flow flow-speed-${speed}`}
            data-flow={`${flow.source}-${flow.target}`}
            points={`${from.x},${from.y} ${middle.x},${middle.y} ${to.x},${to.y}`}
            strokeWidth={2 + speed}
            markerMid={`url(#${arrow})`}
          />
        );
      })}
    </svg>
  );
}

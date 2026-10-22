import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { Flow } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { conduitPath, usePanelBoxes } from "../panelBoxes";
import { steadyPeriod } from "./wavePeriod";

// A wave is many faint strokes centered on one another, each shorter, a
// deeper blue and a touch stronger than the one under it. Their half-lengths
// follow a bell curve, so the blue builds smoothly to a deep middle and every step
// between strokes is too slight to see. Lengths are in em, out of the 14em
// between waves; depth runs from fof.css's icy blue (0) to its deep blue (1).
const STROKES = 18;
const REACH = 6;
const LAYERS = Array.from({ length: STROKES }, (_, index) => {
  const rank = index + 1;
  const half = REACH * Math.sqrt(Math.log((STROKES + 1) / rank) / Math.log(STROKES + 1));
  return { length: Number((2 * half).toFixed(2)), depth: Number((rank / STROKES).toFixed(2)) };
});

/** Each conduit's period, kept from before where its power has not moved far enough to change it. */
function settle(previous: Partial<Record<string, number>>, flows: Flow[]): Partial<Record<string, number>> {
  const next: Record<string, number> = {};
  for (const flow of flows) {
    const key = `${flow.source}-${flow.target}`;
    next[key] = steadyPeriod(previous[key], flow.power_w);
  }
  const same = Object.keys(next).length === Object.keys(previous).length &&
    Object.entries(next).every(([key, period]) => previous[key] === period);
  return same ? previous : next;
}

/** The space between waves, in em. */
const WAVE = 14;

// Power moving between panels, drawn as the console's thick conduits, in right
// angles with rounded elbows, plugged into the panels' edges. Waves of plasma
// roll along each toward its target, faster and the conduit wider with every
// tenfold increase in power; that motion shows the direction. With motion
// turned off, a chevron in the middle shows the direction instead.
//
// Each conduit's waves come as often as its own power calls for (wavePeriod),
// and it publishes that period on the diagram as --fof-roll-<source>-<target>,
// so the graphics timed to it can keep its pace.
//
// Every conduit's waves are timed so that a crest reaches its far end at the
// start of each cycle, whatever its length. What a conduit feeds can then
// time its own light to the crests arriving, as the AC loads' panel does
// for its breakers. A conduit launched from its source, as the grid's is from
// its tower's row of pills, is timed from its start instead, so the source can
// time the waves it sends.
export function Conduits({ flows }: { flows: Flow[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const boxes = usePanelBoxes(svg, flows);
  const [em, setEm] = useState(16);

  const [periods, setPeriods] = useState<Partial<Record<string, number>>>({});

  useLayoutEffect(() => {
    if (svg.current) {
      setEm(parseFloat(getComputedStyle(svg.current).fontSize) || 16);
    }
  }, [boxes]);

  // Each conduit keeps its period until its power has moved well away, so
  // its animation does not restart with every small change. The periods are
  // remembered from render to render, updated as the render finds them moved.
  const settled = settle(periods, flows);
  if (settled !== periods) {
    setPeriods(settled);
  }

  useLayoutEffect(() => {
    const root = svg.current?.parentElement;
    if (!root) {
      return;
    }
    const entries = Object.entries(settled);
    for (const [key, period] of entries) {
      root.style.setProperty(`--fof-roll-${key}`, `${period}s`);
    }
    return () => entries.forEach(([key]) => root.style.removeProperty(`--fof-roll-${key}`));
  }, [settled]);

  return (
    <svg ref={svg} className="fof-conduits" aria-hidden="true">
      {flows.map((flow) => {
        const from = boxes[flow.source];
        const to = boxes[flow.target];
        if (from === undefined || to === undefined) {
          return null;
        }
        const key = `${flow.source}-${flow.target}`;
        const speed = flowSpeed(flow.power_w);
        const period = settled[key] ?? steadyPeriod(undefined, flow.power_w);
        const { d, length, middle, angle } = conduitPath(from, to, 36);
        // How far into its cycle a crest is at the far end when the cycle
        // starts, or for a conduit launched from its source, at its start,
        // which with each crest centered in its wave is always half a cycle.
        const wave = WAVE * em;
        const phase = from.launch ? 0.5 : ((((length - wave / 2) % wave) + wave) % wave) / wave;
        return (
          <g key={key} className={`fof-conduit fof-speed-${speed}`}
            style={{ "--fof-phase": phase.toFixed(3), "--fof-roll": `${period}s` } as CSSProperties}
            data-flow={key}>
            <path className="fof-conduit-body" d={d} />
            {LAYERS.map((layer, index) => (
              <path key={index} className="fof-conduit-wave" d={d}
                style={{ "--length": `${layer.length}em`, "--depth": layer.depth } as CSSProperties} />
            ))}
            <path className="fof-conduit-chevron" d="M-5 -6 L3 0 L-5 6"
              transform={`translate(${middle.x} ${middle.y}) rotate(${angle})`} />
          </g>
        );
      })}
    </svg>
  );
}

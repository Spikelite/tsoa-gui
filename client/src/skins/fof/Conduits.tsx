import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { Flow } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { conduitPath, usePanelBoxes } from "../panelBoxes";

// A wave is many faint strokes centered on one another, each shorter, a
// deeper blue and a touch stronger than the one under it. Their half-lengths follow a
// bell curve, so the blue builds smoothly to a deep middle and every step
// between strokes is too slight to see. Lengths are in em, out of the 14em
// between waves; depth runs from fof.css's icy blue (0) to its deep blue (1).
const STROKES = 18;
const REACH = 6;
const LAYERS = Array.from({ length: STROKES }, (_, index) => {
  const rank = index + 1;
  const half = REACH * Math.sqrt(Math.log((STROKES + 1) / rank) / Math.log(STROKES + 1));
  return { length: Number((2 * half).toFixed(2)), depth: Number((rank / STROKES).toFixed(2)) };
});

/** The space between waves, in em. */
const WAVE = 14;

// Power moving between panels, drawn as the console's thick conduits, in right
// angles with rounded elbows, plugged into the panels' edges. Waves of plasma
// roll along each toward its target, faster and the conduit wider with every
// tenfold increase in power; that motion shows the direction. With motion
// turned off, a chevron in the middle shows the direction instead.
//
// Every conduit's waves are timed so that a crest reaches its far end at the
// start of each cycle, whatever its length. What a conduit feeds can then
// time its own light to the crests arriving, as the AC loads' panel does
// for its breakers.
export function Conduits({ flows }: { flows: Flow[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const boxes = usePanelBoxes(svg, flows);
  const [em, setEm] = useState(16);

  useLayoutEffect(() => {
    if (svg.current) {
      setEm(parseFloat(getComputedStyle(svg.current).fontSize) || 16);
    }
  }, [boxes]);

  return (
    <svg ref={svg} className="fof-conduits" aria-hidden="true">
      {flows.map((flow) => {
        const from = boxes[flow.source];
        const to = boxes[flow.target];
        if (from === undefined || to === undefined) {
          return null;
        }
        const speed = flowSpeed(flow.power_w);
        const { d, length, middle, angle } = conduitPath(from, to, 36);
        // How far into its cycle a crest is at the far end when the cycle starts.
        const wave = WAVE * em;
        const phase = ((((length - wave / 2) % wave) + wave) % wave) / wave;
        return (
          <g key={`${flow.source}-${flow.target}`} className={`fof-conduit fof-speed-${speed}`}
            style={{ "--fof-phase": phase.toFixed(3) } as CSSProperties}
            data-flow={`${flow.source}-${flow.target}`}>
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

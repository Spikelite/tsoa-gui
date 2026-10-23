import { useId, type CSSProperties } from "react";

import type { Box } from "../panelBoxes";
import { CENTER, fraction, SIZE, threads } from "./hubGeometry";
import { HUB_EDGE, type HubPorts } from "./hubPorts";
import { SOFTEN, STROKES, WAVE } from "./waves";

// Where the conduits meet the inverter/charger's hub, drawn on the conduits'
// own layer in the hub's units: the dark square under the hub, which hides
// each conduit's run on to the hub's center, and the threads each conduit
// carries on as past the square's edge into the hub's coil. Being on the same
// layer as the conduits, each conduit and its threads meet exactly at any
// size and any screen scaling. The hub's own drawing, its cells, coil, pulses
// and light, sits over this.
export function HubThreads({ hub, box }: { hub: HubPorts; box: Box }) {
  const id = useId();
  const cycle = hub.cycleUnits || 250;
  const scale = (2 * box.halfWidth) / SIZE;
  const wound = threads(hub.ports);
  return (
    <g className="fof-hub-threads"
      transform={`translate(${box.x - box.halfWidth} ${box.y - box.halfWidth}) scale(${scale})`}>
      {/* The threads' waves roll a whole wave on each cycle, in the hub's units. */}
      <style>{`@keyframes fof-thread-roll { to { stroke-dashoffset: ${-cycle}; } }`}</style>
      <rect className="fof-hub-disc" x={CENTER - HUB_EDGE} y={CENTER - HUB_EDGE} width={2 * HUB_EDGE}
        height={2 * HUB_EDGE} rx={HUB_EDGE / 3} />
      {wound.map(({ port, index, lines }) => {
        const shape = `${id}-${index}`;
        // Blurred along the conduit, as its waves run there.
        const spread = (SOFTEN * cycle) / WAVE;
        const blur = port.side === "left" || port.side === "right" ? `${spread} ${spread * 0.2}` : `${spread * 0.2} ${spread}`;
        return (
          <g key={port.key} className={`fof-thread${port.idle ? " fof-thread-idle" : ""}`}
            style={{ "--fof-roll": `var(--fof-roll-${port.key}, 4s)` } as CSSProperties}>
            {lines.map((line, n) => (
              <g key={n}>
                <clipPath id={`${shape}-${n}`}>
                  <path d={line.outline} />
                </clipPath>
                <path className="fof-thread-body" d={line.d} strokeWidth={line.stroke}
                  clipPath={`url(#${CSS.escape(`${shape}-${n}`)})`} />
              </g>
            ))}
            {/* Each strand's waves under the same blur as the conduits', drawn
                wider than the strand and trimmed to its own share of the
                conduit, as a conduit's are to the conduit, so its edges show
                the wave and not the body under it. */}
            {!port.idle && lines.map((line, n) => {
              const strand = `${shape}-${n}`;
              // A crest is where the strand meets the square's edge as the
              // conduit's crest reaches the edge.
              const phase = fraction(line.edge / cycle - 0.5 - port.crossing);
              return (
                <g key={`waves-${n}`}>
                  <mask id={`${strand}-share`} maskUnits="userSpaceOnUse" {...line.box}>
                    {/* Hard-edged, so that where two strands' shares meet each pixel
                        is wholly one strand's: soft edges would each cover half
                        of it and leave a faint seam. */}
                    <path d={line.share} fill="#fff" shapeRendering="crispEdges" />
                  </mask>
                  <filter id={`${strand}-blur`} filterUnits="userSpaceOnUse" {...line.box}>
                    <feGaussianBlur stdDeviation={blur} />
                  </filter>
                  <g mask={`url(#${CSS.escape(`${strand}-share`)})`}>
                    <g filter={`url(#${CSS.escape(`${strand}-blur`)})`}>
                      {STROKES.map((layer, stroke) => {
                        const dash = layer.share * cycle;
                        const gap = (cycle - dash) / 2;
                        return (
                          <path key={stroke} className="fof-thread-wave" d={line.waves} strokeWidth={line.width + 8}
                            strokeDasharray={`0 ${gap.toFixed(2)} ${dash.toFixed(2)} ${gap.toFixed(2)}`}
                            strokeOpacity={layer.opacity}
                            style={{ "--depth": layer.depth, "--fof-phase": phase.toFixed(3) } as CSSProperties} />
                        );
                      })}
                    </g>
                  </g>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

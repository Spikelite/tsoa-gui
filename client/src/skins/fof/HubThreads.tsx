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
            {/* The waves of all the port's strands under one blur, as the
                conduits' are, trimmed to the strands' outlines. */}
            {!port.idle && (
              <>
                <mask id={shape} maskUnits="userSpaceOnUse" x="0" y="0" width={SIZE} height={SIZE}>
                  {lines.map((line, n) => <path key={n} d={line.outline} fill="#fff" />)}
                </mask>
                {/* Blurred along the conduit, not across the strands, which
                    are too narrow for a blur across them to leave their color. */}
                <filter id={`${shape}-blur`} filterUnits="userSpaceOnUse" x="0" y="0" width={SIZE} height={SIZE}>
                  <feGaussianBlur stdDeviation={port.side === "left" || port.side === "right"
                    ? `${(SOFTEN * cycle) / WAVE} 0` : `0 ${(SOFTEN * cycle) / WAVE}`} />
                </filter>
                <g mask={`url(#${CSS.escape(shape)})`}>
                  <g filter={`url(#${CSS.escape(shape)}-blur)`}>
                    {lines.map((line, n) => {
                      // A crest is where the strand meets the square's edge as
                      // the conduit's crest reaches the edge.
                      const phase = fraction(line.edge / cycle - 0.5 - port.crossing);
                      return STROKES.map((layer, stroke) => {
                        const dash = layer.share * cycle;
                        const gap = (cycle - dash) / 2;
                        // Exactly a strand wide, so side by side the strands'
                        // waves make the conduit's, with none overlapping.
                        return (
                          <path key={`${n}-${stroke}`} className="fof-thread-wave" d={line.waves}
                            strokeWidth={line.width}
                            strokeDasharray={`0 ${gap.toFixed(2)} ${dash.toFixed(2)} ${gap.toFixed(2)}`}
                            strokeOpacity={layer.opacity}
                            style={{ "--depth": layer.depth, "--fof-phase": phase.toFixed(3) } as CSSProperties} />
                        );
                      });
                    })}
                  </g>
                </g>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

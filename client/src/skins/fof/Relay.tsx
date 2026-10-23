import type { CSSProperties } from "react";

import { fraction } from "./hubGeometry";
import type { HubSide } from "./hubPorts";

/** A conduit where it meets the relay, as the conduits work it out. */
export interface RelayLink {
  /** The conduit's source and target, which name its pace, --fof-roll-<key>. */
  key: string;
  side: HubSide;
  /** Whether power leaves the relay along it. */
  outward: boolean;
  idle: boolean;
  /** When in its cycle a pulse sets off along the relay's spoke, 0 to 1, and what share of the cycle the run takes. */
  start: number;
  share: number;
  /** The conduit's width, in em. */
  width: number;
}

/** The relay's radius, and its core's, in em. */
export const RELAY = 2.4;
export const RELAY_CORE = 0.75;
const CELLS = 12;
const CELL_RING = 1.55;
const PULSE = 30;

const ANGLE: Record<HubSide, number> = { right: 0, bottom: 90, left: 180, top: 270 };


// The DC bus drawn as a plasma relay where its conduits meet: a dark round
// body with a port on each side a conduit plugs into, a ring of cells chasing
// round a plasma core that pulses at its own pace, and a spoke from each port
// to the core. Pulses run in along the spokes of the conduits bringing power
// as their crests reach the relay, and out along the spokes of those taking
// it as their crests set off, so the power is seen to pass through it. It
// covers the corner where the conduits meet. Idle, it is dim and still.
export function Relay({ x, y, em, links, beat }: {
  x: number; y: number; em: number; links: RelayLink[];
  /** How long the core takes to pulse and the cells to chase round, in seconds. */
  beat: number;
}) {
  const radius = RELAY * em;
  const busy = links.some((link) => !link.idle);
  const keyframes = links.map((link, index) => {
    const [from, to] = link.outward ? [PULSE, -100] : [-100, PULSE];
    const end = (link.share * 100).toFixed(1);
    return `@keyframes fof-relay-${index} { 0% { stroke-dashoffset: ${from}; opacity: 1; } ${end}% { stroke-dashoffset: ${to}; opacity: 1; }
      ${(link.share * 100 + 0.1).toFixed(1)}%, 100% { stroke-dashoffset: ${to}; opacity: 0; } }`;
  }).join(" ");

  return (
    <g className={`fof-relay${busy ? "" : " fof-relay-idle"}`} transform={`translate(${x} ${y})`}
      style={{ "--fof-beat": `${beat.toFixed(2)}s` } as CSSProperties}>
      <style>{keyframes}</style>
      <circle className="fof-relay-body" r={radius} strokeWidth={0.22 * em} />
      {links.map((link) => {
        const width = link.width * 0.95 * em;
        const depth = 0.6 * em;
        return (
          <rect key={`port-${link.key}`} className={`fof-relay-port${link.idle ? " fof-relay-port-idle" : ""}`}
            x={-depth / 2} y={-width / 2} width={depth} height={width} rx={depth / 3}
            transform={`rotate(${ANGLE[link.side]}) translate(${radius - depth * 0.15} 0)`} />
        );
      })}
      {Array.from({ length: CELLS }, (_, cell) => (
        <rect key={cell} className="fof-relay-cell" x={-0.24 * em} y={-CELL_RING * em - 0.16 * em} width={0.48 * em}
          height={0.32 * em} rx={0.16 * em} transform={`rotate(${(cell * 360) / CELLS + 360 / CELLS / 2})`}
          style={{ "--wave": cell, "--waves": CELLS } as CSSProperties} />
      ))}
      {links.map((link, index) => (
        <g key={`spoke-${link.key}`} transform={`rotate(${ANGLE[link.side]})`}>
          <line className="fof-relay-spoke" x1={RELAY_CORE * em} y1={0} x2={radius} y2={0} strokeWidth={0.14 * em} />
          {!link.idle && (
            // Drawn from the core out, so a pulse in runs it backwards.
            <line className="fof-relay-pulse" x1={RELAY_CORE * em} y1={0} x2={radius} y2={0} pathLength={100}
              strokeWidth={0.26 * em}
              style={{
                animationName: `fof-relay-${index}`,
                animationDuration: `var(--fof-roll-${link.key}, 4s)`,
                animationDelay: `calc(var(--fof-roll-${link.key}, 4s) * ${(fraction(link.start) - 1).toFixed(3)})`,
              } as CSSProperties} />
          )}
        </g>
      ))}
      <circle className="fof-relay-core-ring" r={(RELAY_CORE + 0.08) * em} strokeWidth={0.1 * em} />
      <circle className="fof-relay-core" r={RELAY_CORE * em} />
    </g>
  );
}

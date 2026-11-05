import { useLayoutEffect, useRef, useState, useId, type CSSProperties } from "react";

import { flowSpeed } from "../minimal/flowSpeed";
import { SOFTEN, STROKES } from "./waves";

/** The box round a conduit's route, from the points its path passes through. */
function extent(d: string) {
  const points = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])] as const);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/** A conduit's waves, blurred into one gradient and trimmed to the conduit's shape. */
export function ConduitWaves({ id, d, em }: { id: string; d: string; em: number }) {
  // The blur and the mask that keeps it inside the conduit reach a
  // little past its route, by as much as the conduit's width and the blur's spread.
  const box = extent(d);
  const margin = 3 * em;
  const region = { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin };
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" {...region}>
        <path className="fof-conduit-mask" d={d} />
      </mask>
      <filter id={`${id}-blur`} filterUnits="userSpaceOnUse" {...region}>
        <feGaussianBlur stdDeviation={SOFTEN * em} />
      </filter>
      <g mask={`url(#${CSS.escape(id)})`}>
        <g filter={`url(#${CSS.escape(id)}-blur)`}>
          {STROKES.map((layer, index) => (
            <path key={index} className="fof-conduit-wave" d={d}
              style={{ "--length": `${layer.length}em`, "--depth": layer.depth, "--opacity": layer.opacity } as CSSProperties} />
          ))}
        </g>
      </g>
    </>
  );
}

// A length of conduit on a part's own page, where Conduits.tsx has no other
// part to draw one to. It is drawn as those are, at the power the part's own
// conduit carries, and fades out where it would go on, so it reads as the
// conduit leaving the page rather than one that stops.
export function ConduitRun(props: {
  /** How long it is, in em. */
  length: number;
  power: number;
  /** How long each wave takes, in seconds. */
  period: number;
  /** How far into its cycle a crest is, as Conduits.tsx works out for a conduit. */
  phase: number;
  /** Runs right to left, as a supply's conduit does while power goes back into it. */
  reversed?: boolean;
}) {
  const { length, power, period, phase, reversed = false } = props;
  const svg = useRef<SVGSVGElement>(null);
  const id = useId();
  const [em, setEm] = useState(16);

  useLayoutEffect(() => {
    const element = svg.current;
    if (element === null) {
      return;
    }
    const measure = () => setEm(parseFloat(getComputedStyle(element).fontSize) || 16);
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const middle = 1.5 * em;
  const ends = [`0,${middle}`, `${length * em},${middle}`];
  const d = `M${(reversed ? ends.reverse() : ends).join(" L")}`;
  const active = power > 0;
  const style = { "--run": `${length}em`, "--fof-phase": phase.toFixed(3), "--fof-roll": `${period}s` } as CSSProperties;
  return (
    <svg ref={svg} className="fof-conduit-run" style={style} aria-hidden="true">
      <g className={`fof-conduit fof-speed-${flowSpeed(power)}${active ? "" : " fof-conduit-idle"}`}>
        <path className="fof-conduit-body" d={d} />
        {active && <ConduitWaves id={id} d={d} em={em} />}
        <path className="fof-conduit-chevron" d="M-5 -6 L3 0 L-5 6"
          transform={`translate(${(length * em) / 2} ${middle}) rotate(${reversed ? 180 : 0})`} />
      </g>
    </svg>
  );
}

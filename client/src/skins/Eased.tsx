import { useLayoutEffect, useRef } from "react";

import { UNKNOWN, type Format } from "./format";

const DURATION_MS = 800;

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A number that eases from its last reading to the next instead of jumping.
// Only the text changes from frame to frame: React renders this again only
// when a new reading arrives, about once a second. The text is not React's
// child, so a new render never flashes the end value before the easing.
export function Eased({ value, format }: { value: number | null; format: Format }) {
  const element = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useLayoutEffect(() => {
    const span = element.current;
    if (span === null) {
      return;
    }
    const from = shown.current;
    if (value === null || from === null || from === value || reducedMotion()) {
      shown.current = value;
      span.textContent = value === null ? UNKNOWN : format(value);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now: number) {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const current = from + (value - from) * (1 - (1 - t) ** 3);
      shown.current = current;
      span.textContent = format(current);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [value, format]);

  return <span ref={element} className="reading-value" />;
}

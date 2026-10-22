// What the supplies' schematics share: the drawing's size, the row of pips
// along its bottom that the supply's conduit sets off from, and the timing of
// a pulse running down a cable into the row and along it, as shares of one
// wave's cycle on the conduit, ending at the row's far end as the cycle
// closes, just as a wave sets off along the conduit.

export const SCHEMATIC = { width: 400, height: 180 };
export const PIPS = 14;
export const PIP = { width: 13, height: 34, pitch: 19, first: 130, top: 140 };
export const ROW_END = PIP.first + (PIPS - 1) * PIP.pitch + PIP.width;
export const ROW_MIDDLE = PIP.top + PIP.height / 2;

/** How many pips a pulse lights at once as it runs along the row. */
const PACKET = 2;

export const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

/** How blue a pip is at a point in the cycle, as a pulse entering the row at `start` runs along it. */
function blueness(pip: number, time: number, start: number): number {
  const along = (time - start) / (1 - start);
  if (along < 0) {
    return 0;
  }
  const lead = along * PIPS;
  const middle = pip + 0.5;
  const inside = Math.min(middle - (lead - PACKET), lead - middle);
  return Math.max(0, Math.min(1, inside * 2 + 0.5));
}

/** Keyframes `<prefix>-0` onward, one per pip, for a pulse entering the row at `start`. */
export function pipKeyframes(prefix: string, start: number): string {
  return Array.from({ length: PIPS }, (_, pip) => {
    const stops = Array.from({ length: 41 }, (_, step) => {
      const time = step / 40;
      const blue = Math.round(blueness(pip, time, start) * 100);
      return `${percent(time)} { fill: color-mix(in oklab, var(--fof-drip-blue) ${blue}%, var(--fof-drip-yellow)); }`;
    });
    return `@keyframes ${prefix}-${pip} { ${stops.join(" ")} }`;
  }).join(" ");
}

/** Keyframes for a pulse running the length of a cable, drawn with pathLength 100, between two points in the cycle. */
export function cableKeyframes(name: string, start: number, end: number): string {
  return `@keyframes ${name} {
    0%, ${percent(start - 0.01)} { stroke-dashoffset: 14; opacity: 0; }
    ${percent(start)} { stroke-dashoffset: 14; opacity: 1; }
    ${percent(end)} { stroke-dashoffset: -100; opacity: 1; }
    ${percent(end + 0.01)}, 100% { stroke-dashoffset: -100; opacity: 0; }
  }`;
}

/**
 * How fast a flow moves, in steps of ten times the power: 0 below 10 W up to
 * 4 from 10 kW. A CSS animation restarts whenever its duration changes, so
 * the speed changes only when the power changes a lot.
 */
export function flowSpeed(powerW: number): number {
  return Math.max(0, Math.min(4, Math.floor(Math.log10(Math.max(powerW, 1)))));
}

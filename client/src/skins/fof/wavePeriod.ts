/**
 * How long a conduit carrying this much power takes per wave, in seconds: the
 * time between pulses passing any point, and the time each takes to travel
 * the space to the next. More power means more frequent, faster pulses,
 * relaxed at everyday power and very fast at very high power. A placeholder
 * curve until the limits of the equipment are known.
 */
export function wavePeriod(powerW: number): number {
  const period = 8 * (100 / Math.max(Math.abs(powerW), 1)) ** 0.35;
  return Math.min(12, Math.max(0.6, period));
}

/** Steps per tenfold change in the period. */
const STEPS = 12;

/**
 * The period to show, in steps fine enough to follow the power but coarse
 * enough that the animation, which restarts whenever its period changes,
 * does not restart often. It keeps the previous step until the power has
 * moved well into another, so power hovering at a boundary does not flicker
 * between two.
 */
export function steadyPeriod(previous: number | undefined, powerW: number): number {
  const raw = Math.log10(wavePeriod(powerW)) * STEPS;
  if (previous !== undefined) {
    const held = Math.log10(previous) * STEPS;
    if (Math.abs(raw - held) < 0.75) {
      return previous;
    }
  }
  return Number((10 ** (Math.round(raw) / STEPS)).toFixed(2));
}

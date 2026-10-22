// A wave is many faint strokes centered on one another, each shorter, a
// deeper blue and a touch stronger than the one under it. Their half-lengths
// follow a bell curve, so the blue builds smoothly to a deep middle and every
// step between strokes is too slight to see. Lengths are shares of the space
// between waves; depth runs from fof.css's icy blue (0) to its deep blue (1).
// The conduits draw them in em, out of the 14em between waves, and the hub
// draws them on in its own units.

/** The space between waves, in em. */
export const WAVE = 14;

const STROKES = 18;
const REACH = 6;

export const LAYERS = Array.from({ length: STROKES }, (_, index) => {
  const rank = index + 1;
  const half = REACH * Math.sqrt(Math.log((STROKES + 1) / rank) / Math.log(STROKES + 1));
  return { length: Number((2 * half).toFixed(2)), share: (2 * half) / WAVE, depth: Number((rank / STROKES).toFixed(2)) };
});

// A wave is many faint strokes centered on one another, each shorter, a
// deeper blue and a touch stronger than the one under it. Their half-lengths
// follow a bell curve, so the blue builds smoothly to a deep middle and every
// step between strokes is too slight to see. Lengths are shares of the space
// between waves; depth runs from fof.css's icy blue (0) to its deep blue (1).
// The conduits draw them in em, out of the 14em between waves, and the hub
// draws them on in its own units. However many strokes there are, each ends
// sharply, so the steps between them show; a slight blur, SOFTEN of the
// space between waves, smooths them into one gradient.

/** The space between waves, in em. */
export const WAVE = 14;
/** How far the blur that smooths a wave spreads, in em. */
export const SOFTEN = 0.55;

const COUNT = 18;
const REACH = 6;

export const LAYERS = Array.from({ length: COUNT }, (_, index) => {
  const rank = index + 1;
  const half = REACH * Math.sqrt(Math.log((COUNT + 1) / rank) / Math.log(COUNT + 1));
  return { length: Number((2 * half).toFixed(2)), share: (2 * half) / WAVE, depth: Number((rank / COUNT).toFixed(2)) };
});

/** How strong one of the conduits' strokes is, as fof.css draws it. */
const strength = (depth: number) => 0.05 + depth * 0.1;

/** How much stronger the strokes are drawn under the blur, which spreads the wave's deep middle thinner. */
const DEEPEN = 1.35;

/**
 * The strokes in groups of `every`, each group drawn as one stroke as long as
 * its middle one and strong enough to stand for them all, so a wave drawn
 * with fewer strokes builds to the same blue as one drawn with them all, and
 * a touch stronger again for the blur that smooths them. Tracks and the
 * threads they carry on as share the same groups, so their waves match.
 */
export function thinned(every: number) {
  return Array.from({ length: Math.ceil(LAYERS.length / every) }, (_, group) => {
    const through = LAYERS.slice(group * every, (group + 1) * every);
    const middle = through[Math.floor((through.length - 1) / 2)]!;
    const clear = through.reduce((rest, stroke) => rest * (1 - strength(stroke.depth)), 1);
    return { ...middle, opacity: Number(Math.min(1, 1 - clear ** DEEPEN).toFixed(3)) };
  });
}

/** The groups tracks and threads alike draw their waves in. */
export const STROKES = thinned(3);

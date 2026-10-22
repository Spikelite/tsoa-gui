/**
 * Where the inverter/charger's hub takes its AC inputs, shared by the hub's
 * drawing and the conduits that plug into it. The drawing is HUB_VIEW units
 * square with the core at its center; an inverter/charger with two inputs
 * takes AC input 1 at a node PORT_OFFSET units above the center on its left
 * side and AC input 2 the same distance below it.
 */
export const HUB_VIEW = 140;
export const PORT_OFFSET = 24;

/** How far above (negative) or below the hub's center an AC input's node sits, in the drawing's units. */
export function portShift(input: 1 | 2): number {
  return input === 1 ? -PORT_OFFSET : PORT_OFFSET;
}

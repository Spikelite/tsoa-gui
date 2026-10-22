/**
 * Where conduits meet the inverter/charger's hub, shared by the hub's drawing
 * and the conduits that plug into it. The drawing is HUB_VIEW units square
 * with the core at its center, on a dark square reaching HUB_EDGE units from
 * its center. A conduit runs on under the square to the center, and from
 * where it meets the square's edge the hub draws it on as branches into its
 * windings.
 * An inverter/charger with two inputs takes AC input 1 PORT_OFFSET units
 * above the center on its left and AC input 2 the same distance below it.
 */
export const HUB_VIEW = 200;
export const HUB_EDGE = 96;
export const PORT_OFFSET = 24;

/** How far above (negative) or below the hub's center an AC input's node sits, in the drawing's units. */
export function portShift(input: 1 | 2): number {
  return input === 1 ? -PORT_OFFSET : PORT_OFFSET;
}

export type HubSide = "left" | "right" | "top" | "bottom";

/** A conduit where it meets the hub, as the conduits work it out for the hub to draw. */
export interface HubPort {
  /** The conduit's source and target, which name its pace, --fof-roll-<key>. */
  key: string;
  /** The side of the hub the conduit meets. */
  side: HubSide;
  /** How far the conduit meets that side off its middle, in the drawing's units, down or right positive. */
  offset: number;
  /** Whether power leaves the hub along it. */
  outward: boolean;
  /** Whether it carries no power now. */
  idle: boolean;
  /** When in its cycle a crest crosses the square's edge, 0 to 1. */
  crossing: number;
}

export interface HubPorts {
  ports: HubPort[];
  /** How far a crest moves in one cycle, in the drawing's units. */
  cycleUnits: number;
}

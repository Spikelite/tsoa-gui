import { describe, expect, it } from "vitest";

import {
  arrival, arrived, nextChange, ring, ringSize, send, sourceState, stateAt, steady, type Route,
} from "./carry";
import { WAVE } from "./waves";

// Two seconds a wave, crests half a wave out of step with the page's clock,
// and three waves long: slot m's leading edge is t / 2 + 0.5 - m waves along it.
const route: Route = { period: 2, phase: 0.5, length: 3 };

/** A ring's dash pattern back as its cells, on or off. */
function cells(pattern: string): boolean[] {
  return pattern.split(" ").flatMap((run, index) => Array<boolean>(parseFloat(run) / WAVE).fill(index % 2 === 0));
}

describe("carrying a change along a conduit", () => {
  it("sets a change off with the first slot to leave after the next cycle starts", () => {
    const going = send(steady(false), true, route, 1.0);
    expect(going.changes).toEqual([{ slot: 2, launch: 1, active: true }]);
    // Its source takes it up as the cycle starts...
    expect(sourceState(going, route, 1.9)).toBe(false);
    expect(sourceState(going, route, 2.0)).toBe(true);
    // ...it enters the conduit as slot 2 does, and reaches each point along it at the waves' pace.
    expect(stateAt(going, route, 0, 2.9)).toBe(false);
    expect(stateAt(going, route, 0, 3.0)).toBe(true);
    expect(stateAt(going, route, 1, 4.9)).toBe(false);
    expect(stateAt(going, route, 1, 5.0)).toBe(true);
  });

  it("starts a launched conduit a cycle after its source lights, and stops it with its source", () => {
    const launched: Route = { ...route, lead: 1 };
    const going = send(steady(false), true, launched, 1.0);
    // The drawing lights as the next cycle starts, as any source does...
    expect(sourceState(going, launched, 2.0)).toBe(true);
    expect(arrival(launched, "source", 1.0, true)).toBe(2);
    // ...and its first packet, leaving its row a cycle later, is the conduit's first active wave.
    expect(going.changes).toEqual([{ slot: 3, launch: 1, active: true }]);
    expect(stateAt(going, launched, 0, 4.9)).toBe(false);
    expect(stateAt(going, launched, 0, 5.0)).toBe(true);
    expect(arrival(launched, "target", 1.0, true)).toBe(11);
    // Going idle, the drawing and the conduit stop together, as on any conduit.
    const stopping = send(steady(true), false, launched, 1.0);
    expect(stopping.changes).toEqual([{ slot: 2, launch: 1, active: false }]);
    expect(arrival(launched, "target", 1.0, false)).toBe(9);
    // Stopped again before its first packet left: nothing went along it.
    expect(send(going, false, launched, 2.5)).toEqual(steady(false));
  });

  it("has one state all along the conduit again once a change has run off its end", () => {
    const going = send(steady(true), false, route, 1.0);
    expect(arrived(going, route, 8.9)).toBe(going);
    expect(arrived(going, route, 9.0)).toEqual(steady(false));
    expect(arrival(route, "target", 1.0)).toBe(9);
    expect(arrival(route, "source", 1.0)).toBe(2);
  });

  it("shows the state at each wave's start when it changes faster than a wave crosses", () => {
    // Back again before the slot sets off: nothing to carry.
    expect(send(send(steady(false), true, route, 1.0), false, route, 1.5)).toEqual(steady(false));
    // Back again a cycle later: one slot active, the next idle again.
    const blip = send(send(steady(false), true, route, 1.0), false, route, 2.5);
    expect(blip.changes.map((change) => [change.slot, change.active])).toEqual([[2, true], [3, false]]);
    expect(stateAt(blip, route, 0, 3.0)).toBe(true);
    expect(stateAt(blip, route, 0, 5.0)).toBe(false);
  });

  it("lays each slot's state out in its cell of the ring", () => {
    const going = send(steady(false), true, route, 1.0);
    const ringed = cells(ring(going, route));
    const size = ringSize(route);
    expect(ringed).toHaveLength(size);
    for (let slot = -3; slot <= 10; slot++) {
      expect(ringed[(((-slot - 1) % size) + size) % size]).toBe(slot >= 2);
    }
  });

  it("knows when next anything along the conduit changes", () => {
    const going = send(steady(false), true, route, 1.0);
    expect(nextChange(going, route, [1], 0)).toBe(2);
    expect(nextChange(going, route, [1], 2)).toBe(5);
    expect(nextChange(going, route, [1], 5)).toBe(9);
    expect(nextChange(going, route, [1], 9)).toBeUndefined();
  });
});

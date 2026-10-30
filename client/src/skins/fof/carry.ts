import { createContext, useContext, useEffect, useRef, useState } from "react";

import { reducedMotion } from "../motion";
import { WAVE } from "./waves";

// How a conduit changes between active and idle: with its waves, never all at
// once. Each wave, with half the gap to the next on either side of it, is a
// slot, and each slot carries the state the conduit's source was in as the
// slot set off. So a change travels along the conduit at the waves' pace.
// Going idle, the waves already on it roll on to its end with dark gold
// behind the last; going active, new waves set off from its source and it
// turns yellow as they pass. A state that changes back and forth faster than
// a wave crosses shows as the state at each wave's start.
//
// Every animation in the skin that repeats is pinned to the page's clock
// (pin), so where each slot is follows from the clock alone: at t seconds,
// slot m's leading edge is t / period + phase - m waves along the conduit,
// where phase is the conduit's --fof-phase. What the conduit runs on into,
// the hub's threads, the DC bus's relay and the equipment at either end,
// changes as a change reaches it. With reduced motion no waves are drawn, so
// a change is shown at once.
//
// A supply's drawing launches its conduit: its packets run down a row of
// pips and set off into the conduit as each cycle closes. Taking up a change
// to active, the drawing lights at the next cycle's start like any source,
// but its first packet reaches the end of its row only a cycle later, so the
// conduit's first active wave sets off then (the route's lead). Going idle,
// the drawing and its conduit stop together.

/** The page's clock, in seconds: the timeline every repeating animation in the skin is pinned to. */
export function pageTime(): number {
  const now = typeof document === "undefined" ? undefined : document.timeline?.currentTime;
  return (typeof now === "number" ? now : performance.now()) / 1000;
}

/**
 * Pins every animation under `root` that repeats forever to the page's
 * clock. A CSS animation counts from when it starts, and the skin's start at
 * different moments: a conduit once the panels are measured, and any
 * animation again whenever its pace changes. Pinned, the ones that repeat stay
 * timed to each other, a conduit and what it feeds or is fed by, in step. One
 * that runs once, such as a page zooming open or the skin menu unfolding, is
 * left to play from its own start.
 */
export function pin(root: Element | null | undefined) {
  root?.getAnimations?.({ subtree: true }).forEach((animation) => {
    if (animation.startTime !== 0 && animation.effect?.getComputedTiming().iterations === Infinity) {
      animation.startTime = 0;
    }
  });
}

/**
 * A conduit's waves: how long each takes, in seconds, its --fof-phase, the
 * conduit's length, in waves, and how many cycles after its source takes up a
 * change to active the first active wave sets off.
 */
export interface Route {
  period: number;
  phase: number;
  length: number;
  lead?: number;
}

/** Each conduit's route, by `source-target`. */
export type Routes = Partial<Record<string, Route>>;

/** From slot `slot` on, the conduit is `active`; its source takes the change up at cycle `launch` of the page's clock. */
export interface Change {
  slot: number;
  launch: number;
  active: boolean;
}

/** A conduit's state along its length: `base` behind its first change still on its way, then each change. */
export interface Carried {
  base: boolean;
  changes: Change[];
}

export const steady = (active: boolean): Carried => ({ base: active, changes: [] });

/** The state the conduit is going to, once every change on it has arrived. */
export const latest = (carried: Carried) => carried.changes.at(-1)?.active ?? carried.base;

/** The cycle of the page's clock at which a change made now is taken up, and the slot that first carries it. */
function departure(route: Route, now: number, active: boolean) {
  const launch = Math.floor(now / route.period) + 1;
  return { launch, slot: Math.ceil(launch + (active ? (route.lead ?? 0) : 0) + route.phase) };
}

/**
 * Sends a new state along a conduit. Its source takes it up as the next
 * cycle starts, and it sets off with the first slot to leave after that. A
 * change that would leave in the same slot as the one before it undoes that
 * one instead, so each slot carries the state at its start.
 */
export function send(carried: Carried, active: boolean, route: Route, now: number): Carried {
  if (active === latest(carried)) {
    return carried;
  }
  const { launch, slot } = departure(route, now, active);
  const last = carried.changes.at(-1);
  if (last !== undefined && last.slot >= slot) {
    return { ...carried, changes: carried.changes.slice(0, -1) };
  }
  return { ...carried, changes: [...carried.changes, { slot, launch, active }] };
}

/** The conduit with the changes that have run off its far end taken in. */
export function arrived(carried: Carried, route: Route, now: number): Carried {
  const along = now / route.period + route.phase;
  const gone = carried.changes.findIndex((change) => along - change.slot < route.length);
  const count = gone === -1 ? carried.changes.length : gone;
  return count === 0 ? carried : { base: carried.changes[count - 1]!.active, changes: carried.changes.slice(count) };
}

/** The state slot `slot` carries. */
function slotState(carried: Carried, slot: number): boolean {
  let state = carried.base;
  for (const change of carried.changes) {
    if (change.slot > slot) {
      break;
    }
    state = change.active;
  }
  return state;
}

/** The state `distance` waves along the conduit from its source, at time `now`. */
export function stateAt(carried: Carried, route: Route, distance: number, now: number): boolean {
  return slotState(carried, Math.floor(now / route.period + route.phase - distance));
}

/** The state the conduit's source is in at time `now`, which it sends on with its next slot. */
export function sourceState(carried: Carried, route: Route, now: number): boolean {
  let state = carried.base;
  for (const change of carried.changes) {
    if (now / route.period < change.launch) {
      break;
    }
    state = change.active;
  }
  return state;
}

/** When next after `now` anything along the conduit changes: its source, what is `stops` waves along it, or its far end. */
export function nextChange(carried: Carried, route: Route, stops: number[], now: number): number | undefined {
  let next = Infinity;
  for (const change of carried.changes) {
    for (const cycle of [change.launch, ...[...stops, route.length].map((stop) => change.slot - route.phase + stop)]) {
      const time = cycle * route.period;
      if (time > now && time < next) {
        next = time;
      }
    }
  }
  return next === Infinity ? undefined : next;
}

/** How many slots a conduit's ring holds: enough that one drawn now stays right until its first change has run off. */
export const ringSize = (route: Route) => Math.ceil(2 * route.length) + 8;

const modulo = (n: number, size: number) => ((n % size) + size) % size;

/**
 * The conduit's active stretches as a dash pattern, in em, over its ring of
 * slots, for fof.css to roll along it with its waves. Slot m lies in cell
 * (-m - 1) of the ring, counting round from where the pattern starts, so the
 * pattern repeats exactly as the ring comes round.
 */
export function ring(carried: Carried, route: Route): string {
  const size = ringSize(route);
  const first = (carried.changes[0]?.slot ?? 0) - Math.ceil(route.length) - 2;
  const cells: boolean[] = [];
  for (let slot = first; slot < first + size; slot++) {
    cells[modulo(-slot - 1, size)] = slotState(carried, slot);
  }
  // Alternately on and off, starting on.
  const runs: number[] = [];
  let on = true;
  let run = 0;
  for (const cell of cells) {
    if (cell === on) {
      run++;
    } else {
      runs.push(run);
      on = cell;
      run = 1;
    }
  }
  runs.push(run);
  if (runs.length % 2 === 1) {
    runs.push(0);
  }
  return runs.map((count) => `${count * WAVE}em`).join(" ");
}

/** Which end of a conduit a part's equipment is at. */
export type End = "source" | "target";

/** When a change sent along a conduit now, to active or not, reaches the equipment at one of its ends. */
export function arrival(route: Route, end: End, now: number, active = false): number {
  const { launch, slot } = departure(route, now, active);
  return (end === "source" ? launch : slot - route.phase + route.length) * route.period;
}

/** The conduits' routes, for the equipment they run into or out of to time its changes by. */
export const RoutesContext = createContext<Routes>({});

/** The conduits a change to a part's equipment travels with, the first of them drawn, and the end the equipment is at. */
export interface Along {
  keys: string[];
  end: End;
}

/** A change to a part's equipment on its way, and how it was timed. */
interface Waiting<T> {
  value: T;
  keys: string[];
  end: End;
  /** When on the page's clock the change was made. */
  made: number;
  /** When the change before it arrives: no change arrives ahead of an earlier one. */
  after: number;
  /** The route it was timed by, if its conduit had one. */
  route?: Route;
  timer: number;
}

const routeOf = (routes: Routes, keys: string[]) => keys.map((key) => routes[key]).find((found) => found !== undefined);

/**
 * `value`, changed only when a change sent along its conduit now would reach
 * the equipment: at the conduit's source, as its next wave sets off, or at
 * its target, as the change runs off its end. Without such a conduit, or with
 * reduced motion, it changes at the next moment it can.
 *
 * A conduit going between idle and active also changes pace, and publishes
 * its new route a render after the change is made. A change still on its way
 * is timed again by the new route, from the moment it was made, so the
 * equipment and the conduit keep one clock.
 */
export function useCarried<T>(value: T, along: Along | ((next: T, previous: T) => Along)): T {
  const routes = useContext(RoutesContext);
  const [shown, setShown] = useState(value);
  const timing = useRef({ routes, along, sent: value, last: 0 });
  const timers = useRef(new Set<number>());
  const waiting = useRef<Waiting<T> | null>(null);

  useEffect(() => {
    timing.current.routes = routes;
    timing.current.along = along;
  });

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const current = timing.current;
    if (Object.is(value, current.sent)) {
      return;
    }
    const { keys, end } = typeof current.along === "function" ? current.along(value, current.sent) : current.along;
    current.sent = value;
    waiting.current = schedule({ value, keys, end, made: pageTime(), after: current.last }, current, timers.current,
      waiting, setShown);
  }, [value]);

  useEffect(() => {
    const change = waiting.current;
    const route = change === null ? undefined : routeOf(routes, change.keys);
    if (change === null || route === undefined
      || (change.route !== undefined && change.route.period === route.period && change.route.phase === route.phase)) {
      return;
    }
    window.clearTimeout(change.timer);
    timers.current.delete(change.timer);
    waiting.current = schedule(change, timing.current, timers.current, waiting, setShown);
  }, [routes]);

  return shown;
}

/** Times a change by its conduit's route as it stands, and sets it to arrive then. */
function schedule<T>(
  change: Omit<Waiting<T>, "timer" | "route">,
  current: { routes: Routes; last: number },
  timers: Set<number>,
  waiting: { current: Waiting<T> | null },
  show: (value: T) => void,
): Waiting<T> {
  const route = routeOf(current.routes, change.keys);
  const now = pageTime();
  // Changes arrive in the order they were made.
  const at = Math.max(change.after,
    route && !reducedMotion() ? arrival(route, change.end, change.made, change.value === true) : now);
  current.last = at;
  const timer = window.setTimeout(() => {
    timers.delete(timer);
    if (waiting.current?.timer === timer) {
      waiting.current = null;
    }
    show(change.value);
  }, Math.max(0, at - now) * 1000);
  timers.add(timer);
  return { ...change, route, timer };
}

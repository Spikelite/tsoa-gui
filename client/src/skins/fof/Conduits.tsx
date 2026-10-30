import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { Flow, PartName } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { reducedMotion } from "../motion";
import { approach, conduitPath, usePanelMeasure, type Box } from "../panelBoxes";
import {
  arrived, latest, nextChange, pageTime, pin, ring, ringSize, send, sourceState, stateAt, steady, type Carried,
  type Route, type Routes,
} from "./carry";
import { fraction } from "./hubGeometry";
import { HUB_EDGE, HUB_VIEW, portShift, type HubPort, type HubPorts } from "./hubPorts";
import { HubThreads } from "./HubThreads";
import { Relay, RELAY, RELAY_CORE, type RelayLink } from "./Relay";
import { SOFTEN, STROKES, WAVE } from "./waves";
import { steadyPeriod } from "./wavePeriod";

/** The box round a conduit's route, from the points its path passes through. */
function extent(d: string) {
  const points = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])] as const);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/**
 * Each conduit's period, kept from before where its power has not moved far
 * enough to change it, and kept as it is while `held`: while a change is on
 * its way along it, or it is going idle, its waves keep their pace.
 */
function settle(
  previous: Partial<Record<string, number>>, flows: Flow[], held: (flow: Flow) => boolean,
): Partial<Record<string, number>> {
  const next: Record<string, number> = {};
  for (const flow of flows) {
    const key = `${flow.source}-${flow.target}`;
    const kept = previous[key];
    next[key] = kept !== undefined && held(flow) ? kept : steadyPeriod(kept, flow.power_w);
  }
  const same = Object.keys(next).length === Object.keys(previous).length &&
    Object.entries(next).every(([key, period]) => previous[key] === period);
  return same ? previous : next;
}

/** The two parts a conduit joins, whichever way it runs. */
const pairOf = (flow: Flow) => [flow.source, flow.target].sort().join(" ");

/**
 * A conduit's state along its length, kept from render to render with the
 * way it runs and how wide it is drawn, which it keeps while it carries a
 * change.
 */
interface Line {
  key: string;
  carried: Carried;
  speed: number;
}

type Lines = Partial<Record<string, Line>>;

/** What the conduits record of each flow they draw. */
interface Entry {
  pair: string;
  key: string;
  active: boolean;
  speed: number;
  route: Route;
  /** How far along it, in waves, what it runs on into takes up its state. */
  stops: number[];
}

/**
 * The flows as the conduits draw them. A conduit keeps the way it runs while
 * it goes idle, so its last waves roll on the way they were going, and while
 * it is idle. Power setting off the other way waits for it to empty, and then
 * sets off from the other end.
 */
function oriented(flows: Flow[], lines: Lines): Flow[] {
  return flows.map((flow) => {
    const line = lines[pairOf(flow)];
    if (line === undefined || line.key === `${flow.source}-${flow.target}`) {
      return flow;
    }
    if (flow.power_w > 0 && latest(line.carried) === false && line.carried.changes.length === 0) {
      return flow;
    }
    return { source: flow.target, target: flow.source, power_w: 0 };
  });
}

/** The lines with each flow's state sent along its conduit, and what has arrived taken in. */
function record(previous: Lines, entries: Entry[], now: number, reduced: boolean): Lines {
  const next: Lines = {};
  let changed = Object.keys(previous).length !== entries.length;
  for (const { pair, key, active, speed, route } of entries) {
    const line = previous[pair];
    const carried = line === undefined || reduced ? steady(active)
      : line.key !== key ? send(steady(false), active, route, now)
      : send(arrived(line.carried, route, now), active, route, now);
    const updated = { key, carried, speed };
    next[pair] = line !== undefined && JSON.stringify(line) === JSON.stringify(updated) ? line : updated;
    changed ||= next[pair] !== line;
  }
  return changed ? next : previous;
}

/** A conduit's width at everyday power, in em, the measure of the smallest bend worth drawing. */
const WAVE_WIDTH = 1.4;

/**
 * How far to move the hub so that the first conduit launched toward it that
 * is nearly level with it runs straight; with none, no distance. The boxes are measured
 * with the hub already moved by `current`.
 */
function hubNudge(
  boxes: Partial<Record<string, Box>>, flows: Flow[], current: number, smallest: number,
  target: (flow: Flow) => Box | undefined,
): number {
  for (const flow of flows) {
    const from = boxes[flow.source];
    const to = target(flow);
    if (from?.launch && to?.hub) {
      const apart = Math.round(from.y - to.y + current);
      if (Math.abs(apart) < smallest) {
        return apart;
      }
    }
  }
  return 0;
}

// Rounded, so that the hub, which hears these through a comparison of the
// whole set, is not told of changes too small to see.
const rounded = (value: number) => Number(fraction(value).toFixed(3));

/**
 * Where a conduit meets the hub, if it does, and when in its cycle a crest
 * reaches the edge of the hub's square there: a conduit into the hub has a crest at its end,
 * the hub's center, as each cycle starts, and one out of it has a crest at
 * its far end then, so a crest crosses the disc as far before or after as the
 * distance takes at the waves' pace.
 */
function hubPort(
  flow: Flow, from: Box, to: Box, hub: Box, length: number, em: number, speed: number, idle: (toEdge: number) => boolean,
): HubPort | null {
  if (!from.hub && !to.hub) {
    return null;
  }
  const { main, sign } = approach(from, to);
  const scale = (2 * hub.halfWidth) / HUB_VIEW;
  const wave = WAVE * em;
  const outward = Boolean(from.hub);
  // A conduit into the hub arrives travelling the way it runs; one out of it leaves that way.
  const heading = outward ? sign : -sign;
  const side = main === "x" ? (heading > 0 ? "right" : "left") : heading > 0 ? "bottom" : "top";
  const cross = main === "x" ? "y" : "x";
  const offset = outward ? 0 : (to[cross] - hub[cross]) / scale;
  const toEdge = HUB_EDGE * scale;
  return {
    key: `${flow.source}-${flow.target}`,
    side,
    offset: Number(offset.toFixed(2)),
    // As wide as fof.css draws a conduit at its speed.
    width: Number((((1 + 0.2 * speed) * em) / scale).toFixed(2)),
    outward,
    idle: idle(toEdge),
    // A conduit launched from its source, as a supply's is from its row of
    // pips, has its crest at its start as each cycle starts instead.
    crossing: outward ? rounded(-(length - toEdge) / wave)
      : from.launch ? rounded((length - toEdge) / wave) : rounded(1 - toEdge / wave),
  };
}

// Power moving between panels, drawn as the console's thick conduits, in right
// angles with rounded elbows, plugged into the panels' edges. Waves of plasma
// roll along each toward its target, faster and the conduit wider with every
// tenfold increase in power; that motion shows the direction. With motion
// turned off, a chevron in the middle shows the direction instead.
//
// Each conduit's waves come as often as its own power calls for (wavePeriod),
// and it publishes that period on the diagram as --fof-roll-<source>-<target>,
// so the graphics timed to it can keep its pace.
//
// Every conduit's waves are timed so that a crest reaches its far end at the
// start of each cycle, whatever its length. What a conduit feeds can then
// time its own light to the crests arriving, as the AC loads' panel does
// for its breakers. A conduit launched from its source, as the grid's is from
// its tower's row of pills, is timed from its start instead, so the source can
// time the waves it sends.
//
// A conduit changes between active and idle with its waves, as carry.ts
// describes: while a change is on its way along it, its body is dark gold
// with its active stretches drawn over it in yellow, and its waves only in
// those, and both roll along it with the waves.
export function Conduits({ flows, inputs = {}, onHubPorts, onRoutes }: {
  flows: Flow[];
  /** The AC input of the inverter/charger's hub each supply plugs into, where it has two. */
  inputs?: Partial<Record<PartName, 1 | 2>>;
  /** Hears where and when the conduits meet the hub, for the hub to carry them on in its drawing. */
  onHubPorts?: (ports: HubPorts) => void;
  /** Hears each conduit's route, for the equipment at its ends to time its changes by. */
  onRoutes?: (routes: Routes) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const soften = useId();
  const [nudge, setNudge] = useState(0);

  // Moves the hub before the panels are measured, so they are measured where it is.
  useLayoutEffect(() => {
    svg.current?.parentElement?.style.setProperty("--fof-hub-nudge", `${nudge}px`);
  }, [nudge]);

  const { boxes: measured, revision: measuredAt } = usePanelMeasure(svg, flows, nudge);
  // A supply wired to one of the hub's two AC inputs meets the hub at that
  // input's node rather than at its center.
  const target = (flow: Flow): Box | undefined => {
    const box = measured[flow.target];
    const input = flow.source === "dc_bus" ? undefined : inputs[flow.source];
    return box?.hub && input ? { ...box, y: box.y + (portShift(input) * 2 * box.halfWidth) / HUB_VIEW } : box;
  };
  const boxes = measured;
  const [em, setEm] = useState(16);

  const [periods, setPeriods] = useState<Partial<Record<string, number>>>({});

  useLayoutEffect(() => {
    if (svg.current) {
      setEm(parseFloat(getComputedStyle(svg.current).fontSize) || 16);
    }
  }, [boxes]);

  // A conduit between a row that launches it and a hub must meet each at its
  // own level, so it bends between them. A bend smaller than a conduit and a
  // half would read as a mistake, so where they are that nearly level, the
  // hub moves to the row's level instead and the conduit runs straight.
  // The boxes were measured with the hub moved by `measuredAt`; until they are
  // measured again with the latest move, there is nothing new to go on.
  if (measuredAt === nudge) {
    const levelled = hubNudge(boxes, flows, nudge, 1.5 * WAVE_WIDTH * em, target);
    if (levelled !== nudge) {
      setNudge(levelled);
    }
  }

  // Each conduit's state along it, and the time it was last brought up to
  // date, which is when anything along it last changed.
  const [lines, setLines] = useState<Lines>({});
  const [now, setNow] = useState(0);
  const shown = oriented(flows, lines);
  const lineOf = (flow: Flow) => {
    const line = lines[pairOf(flow)];
    return line?.key === `${flow.source}-${flow.target}` ? line : undefined;
  };

  // Each conduit keeps its period until its power has moved well away, so
  // its animation does not restart with every small change. The periods are
  // remembered from render to render, updated as the render finds them moved.
  const settled = settle(periods, shown, (flow) => {
    const line = lineOf(flow);
    return flow.power_w <= 0 || (line !== undefined && line.carried.changes.length > 0);
  });
  if (settled !== periods) {
    setPeriods(settled);
  }

  useLayoutEffect(() => {
    const root = svg.current?.parentElement;
    if (!root) {
      return;
    }
    const entries = Object.entries(settled);
    for (const [key, period] of entries) {
      root.style.setProperty(`--fof-roll-${key}`, `${period}s`);
    }
    return () => entries.forEach(([key]) => root.style.removeProperty(`--fof-roll-${key}`));
  }, [settled]);

  const hub = boxes.inverter_charger;
  const bus = boxes.dc_bus;
  const wave = WAVE * em;
  const ports: HubPort[] = [];
  const entries: Entry[] = [];
  const drawn = shown.map((flow) => {
    const from = boxes[flow.source];
    const to = target(flow);
    if (from === undefined || to === undefined) {
      return null;
    }
    const key = `${flow.source}-${flow.target}`;
    const line = lineOf(flow);
    // A conduit turning round sets off from empty.
    const carried = line?.carried ?? steady(lines[pairOf(flow)] === undefined && flow.power_w > 0);
    // A conduit keeps its width while a change is on its way along it, so
    // that only its color moves.
    const speed = line !== undefined && (line.carried.changes.length > 0 || latest(line.carried) !== flow.power_w > 0)
      ? line.speed : flowSpeed(flow.power_w);
    const path = conduitPath(from, to, 36);
    // How far into its cycle a crest is at the far end when the cycle
    // starts, or for a conduit launched from its source, at its start,
    // which with each crest centered in its wave is always half a cycle.
    const phase = from.launch ? 0.5 : ((((path.length - wave / 2) % wave) + wave) % wave) / wave;
    const route: Route = {
      period: settled[key] ?? steadyPeriod(undefined, flow.power_w),
      phase: Number(phase.toFixed(3)),
      length: path.length / wave,
    };
    // What the conduit runs on into takes up its state where it meets it:
    // out of the hub or the DC bus, as the conduit's source does, and into
    // them, as a change reaches the hub's edge or the relay's rim.
    const stops: number[] = [];
    const along = (outward: boolean, rim: number) => {
      if (outward) {
        return sourceState(carried, route, now);
      }
      stops.push((path.length - rim) / wave);
      return stateAt(carried, route, (path.length - rim) / wave, now);
    };
    const port = hub?.hub
      ? hubPort(flow, from, to, hub, path.length, em, speed, (toEdge) => !along(Boolean(from.hub), toEdge))
      : null;
    if (port) {
      ports.push(port);
    }
    const relayIdle = bus && (flow.source === "dc_bus" || flow.target === "dc_bus")
      ? !along(flow.source === "dc_bus", RELAY * em) : undefined;
    entries.push({ pair: pairOf(flow), key, active: flow.power_w > 0, speed, route, stops });
    return { flow, from, path, key, carried, speed, route, relayIdle };
  });
  const cycleUnits = hub?.hub ? Number(((WAVE * em * HUB_VIEW) / (2 * hub.halfWidth)).toFixed(1)) : 0;

  // Sends each flow's state along its conduit as it changes, and takes in
  // what has arrived, as soon as there is either, and draws again when next
  // anything along a conduit changes: a source taking up a change, a change
  // reaching the hub or the relay, or one running off a conduit's far end,
  // which then has one state all along it again. Until a new state is sent,
  // a conduit is drawn as it was, which is right until its next wave sets off.
  const recorded = JSON.stringify(entries);
  useEffect(() => {
    const at = pageTime();
    const sent = JSON.parse(recorded) as Entry[];
    const due = record(lines, sent, at, reducedMotion()) !== lines ? [at] : sent.flatMap(({ pair, key, route, stops }) => {
      const line = lines[pair];
      const next = line?.key === key ? nextChange(line.carried, route, stops, at) : undefined;
      return next === undefined ? [] : [next + 0.015];
    });
    if (due.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      const later = pageTime();
      setLines((previous) => record(previous, sent, later, reducedMotion()));
      setNow(later);
    }, (Math.min(...due) - at) * 1000);
    return () => window.clearTimeout(timer);
  }, [recorded, lines, now]);

  // A conduit carrying a change draws its active stretches with an animation
  // of their own, which has to keep the waves' time from its start.
  useLayoutEffect(() => pin(svg.current));

  // The DC bus's conduits, where they meet its relay, and when their crests pass it.
  const relay: RelayLink[] = bus ? drawn.flatMap((entry) => {
    if (entry === null || entry.relayIdle === undefined) {
      return [];
    }
    const { flow, from, path, speed } = entry;
    const to = boxes[flow.target]!;
    const outward = flow.source === "dc_bus";
    const { main, sign } = approach(from, to);
    const heading = outward ? sign : -sign;
    const core = RELAY_CORE * em;
    const rim = RELAY * em;
    // A conduit into the bus has a crest at its end, the bus, as each cycle
    // starts, or at its start if its source launches it; one out of it has a
    // crest at its far end then, so its crests leave the bus as far before
    // as its length takes.
    const start = outward ? (core - path.length) / wave
      : from.launch ? (path.length - rim) / wave : -rim / wave;
    return [{
      key: `${flow.source}-${flow.target}`,
      side: main === "x" ? (heading > 0 ? "right" : "left") : heading > 0 ? "bottom" : "top",
      outward,
      idle: entry.relayIdle,
      start,
      share: (rim - core) / wave,
      width: 1 + 0.2 * speed,
    }];
  }) : [];
  // The relay's core pulses quicker the more power passes through the bus.
  const through = flows.filter((flow) => flow.target === "dc_bus").reduce((sum, flow) => sum + flow.power_w, 0);
  const heard = JSON.stringify({ ports, cycleUnits });
  useLayoutEffect(() => {
    onHubPorts?.(JSON.parse(heard) as HubPorts);
  }, [heard, onHubPorts]);
  const routed = JSON.stringify(Object.fromEntries(entries.map(({ key, route }) => [key, route])));
  useLayoutEffect(() => {
    onRoutes?.(JSON.parse(routed) as Routes);
  }, [routed, onRoutes]);

  return (
    <svg ref={svg} className="fof-conduits" aria-hidden="true">
      {drawn.map((entry) => {
        if (entry === null) {
          return null;
        }
        const { key, path, carried, speed, route } = entry;
        const { d, middle, angle } = path;
        const carrying = carried.changes.length > 0;
        const active = carrying || carried.base;
        // The blur and the mask that keeps it inside the conduit reach a
        // little past its route, by as much as the conduit's width and the blur's spread.
        const box = extent(d);
        const margin = 3 * em;
        const region = { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin };
        const mask = `${soften}-${key}`;
        const style = {
          "--fof-phase": route.phase.toFixed(3),
          "--fof-roll": `${route.period}s`,
          ...(carrying ? { "--fof-carried": ring(carried, route), "--fof-ring": ringSize(route) } : {}),
        } as CSSProperties;
        return (
          <g key={key} className={`fof-conduit fof-speed-${speed}${active ? "" : " fof-conduit-idle"}${
            carrying ? " fof-conduit-carrying" : ""}`} style={style} data-flow={key}>
            <path className="fof-conduit-body" d={d} />
            {carrying && <path className="fof-conduit-carried" d={d} />}
            {active && (
              <>
                <mask id={mask} maskUnits="userSpaceOnUse" {...region}>
                  <path className="fof-conduit-mask" d={d} />
                </mask>
                <filter id={`${mask}-blur`} filterUnits="userSpaceOnUse" {...region}>
                  <feGaussianBlur stdDeviation={SOFTEN * em} />
                </filter>
                <g mask={`url(#${CSS.escape(mask)})`}>
                  <g filter={`url(#${CSS.escape(mask)}-blur)`}>
                    {STROKES.map((layer, index) => (
                      <path key={index} className="fof-conduit-wave" d={d}
                        style={{ "--length": `${layer.length}em`, "--depth": layer.depth, "--opacity": layer.opacity } as CSSProperties} />
                    ))}
                  </g>
                </g>
              </>
            )}
            <path className="fof-conduit-chevron" d="M-5 -6 L3 0 L-5 6"
              transform={`translate(${middle.x} ${middle.y}) rotate(${angle})`} />
          </g>
        );
      })}
      {/* Where the conduits meet the hub: on this layer, so each conduit and
          its threads into the hub are one drawing. */}
      {hub?.hub && <HubThreads hub={{ ports, cycleUnits }} box={hub} />}
      {bus && relay.length > 0 && (
        <Relay x={bus.x} y={bus.y} em={em} links={relay} beat={Math.min(3, Math.max(0.6, 3 / Math.sqrt(1 + through / 500)))} />
      )}
    </svg>
  );
}

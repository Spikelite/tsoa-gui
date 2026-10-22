import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { Flow, PartName } from "../../model/system";
import { flowSpeed } from "../minimal/flowSpeed";
import { approach, conduitPath, usePanelMeasure, type Box } from "../panelBoxes";
import { HUB_EDGE, HUB_VIEW, portShift, type HubPort, type HubPorts } from "./hubPorts";
import { LAYERS, WAVE } from "./waves";
import { steadyPeriod } from "./wavePeriod";

/** Each conduit's period, kept from before where its power has not moved far enough to change it. */
function settle(previous: Partial<Record<string, number>>, flows: Flow[]): Partial<Record<string, number>> {
  const next: Record<string, number> = {};
  for (const flow of flows) {
    const key = `${flow.source}-${flow.target}`;
    next[key] = steadyPeriod(previous[key], flow.power_w);
  }
  const same = Object.keys(next).length === Object.keys(previous).length &&
    Object.entries(next).every(([key, period]) => previous[key] === period);
  return same ? previous : next;
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

const fraction = (value: number) => Number((((value % 1) + 1) % 1).toFixed(3));

/**
 * Where a conduit meets the hub, if it does, and when in its cycle a crest
 * reaches the edge of the hub's square there: a conduit into the hub has a crest at its end,
 * the hub's center, as each cycle starts, and one out of it has a crest at
 * its far end then, so a crest crosses the disc as far before or after as the
 * distance takes at the waves' pace.
 */
function hubPort(flow: Flow, from: Box, to: Box, hub: Box, length: number, em: number): HubPort | null {
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
    width: Number((((1 + 0.2 * flowSpeed(flow.power_w)) * em) / scale).toFixed(2)),
    outward,
    idle: flow.power_w <= 0,
    crossing: outward ? fraction(-(length - toEdge) / wave) : fraction(1 - toEdge / wave),
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
export function Conduits({ flows, inputs = {}, onHubPorts }: {
  flows: Flow[];
  /** The AC input of the inverter/charger's hub each supply plugs into, where it has two. */
  inputs?: Partial<Record<PartName, 1 | 2>>;
  /** Hears where and when the conduits meet the hub, for the hub to carry them on in its drawing. */
  onHubPorts?: (ports: HubPorts) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
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

  // Each conduit keeps its period until its power has moved well away, so
  // its animation does not restart with every small change. The periods are
  // remembered from render to render, updated as the render finds them moved.
  const settled = settle(periods, flows);
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
  const ports: HubPort[] = [];
  const drawn = flows.map((flow) => {
    const from = boxes[flow.source];
    const to = target(flow);
    if (from === undefined || to === undefined) {
      return null;
    }
    const path = conduitPath(from, to, 36);
    const port = hub?.hub ? hubPort(flow, from, to, hub, path.length, em) : null;
    if (port) {
      ports.push(port);
    }
    return { flow, from, path };
  });
  const cycleUnits = hub?.hub ? Number(((WAVE * em * HUB_VIEW) / (2 * hub.halfWidth)).toFixed(1)) : 0;
  const heard = JSON.stringify({ ports, cycleUnits });
  useLayoutEffect(() => {
    onHubPorts?.(JSON.parse(heard) as HubPorts);
  }, [heard, onHubPorts]);

  return (
    <svg ref={svg} className="fof-conduits" aria-hidden="true">
      {drawn.map((entry) => {
        if (entry === null) {
          return null;
        }
        const { flow, from, path } = entry;
        const key = `${flow.source}-${flow.target}`;
        const speed = flowSpeed(flow.power_w);
        const period = settled[key] ?? steadyPeriod(undefined, flow.power_w);
        const { d, length, middle, angle } = path;
        // How far into its cycle a crest is at the far end when the cycle
        // starts, or for a conduit launched from its source, at its start,
        // which with each crest centered in its wave is always half a cycle.
        const wave = WAVE * em;
        const phase = from.launch ? 0.5 : ((((length - wave / 2) % wave) + wave) % wave) / wave;
        return (
          <g key={key} className={`fof-conduit fof-speed-${speed}${flow.power_w > 0 ? "" : " fof-conduit-idle"}`}
            style={{ "--fof-phase": phase.toFixed(3), "--fof-roll": `${period}s` } as CSSProperties}
            data-flow={key}>
            <path className="fof-conduit-body" d={d} />
            {LAYERS.map((layer, index) => (
              <path key={index} className="fof-conduit-wave" d={d}
                style={{ "--length": `${layer.length}em`, "--depth": layer.depth } as CSSProperties} />
            ))}
            <path className="fof-conduit-chevron" d="M-5 -6 L3 0 L-5 6"
              transform={`translate(${middle.x} ${middle.y}) rotate(${angle})`} />
          </g>
        );
      })}
    </svg>
  );
}

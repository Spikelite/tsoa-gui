import type { CSSProperties } from "react";

import type { InverterCharger, InverterState } from "../../model/system";
import { Eased } from "../Eased";
import * as f from "../format";
import { flowSpeed } from "../minimal/flowSpeed";

/** What the inverter/charger is doing with power, which sets its ring's color. */
type Duty = "inverting" | "charging" | "passing" | "idle";

const DUTIES: Partial<Record<InverterState, Duty>> = {
  inverting: "inverting",
  power_assist: "inverting",
  bulk: "charging",
  absorption: "charging",
  float: "charging",
  storage: "charging",
  equalize: "charging",
  sustain: "charging",
  passthrough: "passing",
  power_supply: "passing",
};

function duty(inverter: InverterCharger): Duty {
  return inverter.status === "offline" || inverter.state === null ? "idle" : (DUTIES[inverter.state] ?? "idle");
}

// The ring's light is two comets chasing round it, each a stack of many
// faint arcs that shorten, strengthen and whiten toward its head, so its tail
// fades out smoothly with no blur filter. A wider, fainter copy of each arc
// blooms onto the dark bezel around it. Lengths are in hundredths of the ring,
// out of the half ring between the two heads.
const ARCS = 16;
const TAIL = 40;
const COMET = Array.from({ length: ARCS }, (_, index) => {
  const heat = (index + 1) / ARCS;
  return { length: Number((TAIL * (1 - index / ARCS)).toFixed(2)), alpha: 0.04 + heat * 0.1, heat };
});

// The inverter/charger drawn as a piece of power equipment: a bolted, vented
// housing with a round window, and in it a ring of energy that spins while
// power moves through it, faster with every tenfold increase in power, and
// stands still when it is idle. Its color says what it is doing, which its
// state also says in words: blue plasma while it inverts from the battery,
// teal while it charges it, lavender while it passes the supply through. Its
// output power sits in the middle.
export function InverterCore({ inverter }: { inverter: InverterCharger }) {
  const work = duty(inverter);
  const power = Math.max(
    Math.abs(inverter.ac_in_power_w ?? 0),
    Math.abs(inverter.ac_out_power_w ?? 0),
    Math.abs(inverter.dc_power_w ?? 0),
  );
  const speed = flowSpeed(power);

  return (
    <div className={`fof-unit fof-duty-${work} fof-spin-${speed}`} aria-hidden="true">
      <svg viewBox="0 0 140 140" className="fof-unit-art">
        <defs>
          <linearGradient id="fof-housing" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b2838" />
            <stop offset="1" stopColor="#121019" />
          </linearGradient>
        </defs>
        <rect className="fof-housing" x="3" y="3" width="134" height="134" rx="16" fill="url(#fof-housing)" />
        {[18, 122].map((x) => [18, 122].map((y) => <circle key={`${x}-${y}`} className="fof-bolt" cx={x} cy={y} r="3.5" />))}
        {[46, 56, 66, 76, 86, 96].map((y) => (
          <g key={y} className="fof-vent">
            <line x1="9" y1={y} x2="15" y2={y} />
            <line x1="125" y1={y} x2="131" y2={y} />
          </g>
        ))}
        <circle className="fof-bezel" cx="70" cy="70" r="52" />
        <circle className="fof-ring-track" cx="70" cy="70" r="42" />
        <circle className="fof-ring-glow" cx="70" cy="70" r="42" />
        <g className="fof-ring-spin">
          {["fof-ring-halo", "fof-ring-arc"].map((layer) =>
            COMET.map((arc) => (
              <circle key={`${layer}-${arc.length}`} className={layer} cx="70" cy="70" r="42" pathLength="100"
                strokeDasharray={`${arc.length} ${50 - arc.length}`} strokeDashoffset={arc.length - TAIL}
                style={{ "--alpha": arc.alpha, "--heat": arc.heat } as CSSProperties} />
            )),
          )}
        </g>
      </svg>
      <span className="fof-unit-figure">
        <Eased value={inverter.ac_out_power_w} format={f.power} />
      </span>
    </div>
  );
}

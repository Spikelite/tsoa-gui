import { useId, type CSSProperties } from "react";

import type { Battery } from "../../model/system";
import { batteryState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { flowSpeed } from "../minimal/flowSpeed";
import { StatusIcon } from "../StatusIcon";

// The battery as a glowing vertical core. Its light follows the charge: the
// column fills to the state of charge and glows brighter the fuller it is.
// Its pulse follows the power: bands move up while it charges and down while
// it discharges, faster with every tenfold increase in power, and stand still
// when it is idle.
export function Core({ battery }: { battery: Battery }) {
  const heading = useId();
  const soc = battery.soc_percent;
  const direction = battery.activity === "charging" ? "up" : battery.activity === "discharging" ? "down" : "still";
  const pulse = flowSpeed(Math.abs(battery.power_w ?? 0));
  const charge = Math.max(0, Math.min(100, soc ?? 0));
  const vessel = { "--charge": `${charge}%`, "--glow": (0.25 + 0.75 * charge / 100).toFixed(2) } as CSSProperties;
  const offline = battery.status === "offline";

  return (
    <section className={`fof-core status-${battery.status}`} data-part="battery" aria-labelledby={heading}>
      <header className="fof-core-header">
        <h2 id={heading}>Battery</h2>
        <p className="fof-state">
          <StatusIcon status={battery.status} />
          <span>{offline ? "Not reporting" : batteryState(battery)}</span>
        </p>
      </header>
      <div
        className={`fof-vessel fof-${direction} fof-pulse-${pulse}`}
        style={vessel}
        role="meter"
        aria-label="State of charge"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={soc ?? undefined}
      >
        <div className="fof-plasma">
          <div className="fof-bands" />
        </div>
        <div className="fof-ticks" aria-hidden="true">
          {[100, 75, 50, 25, 0].map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
      </div>
      {!offline && (
        <>
          <p className="fof-core-figure">
            <Eased value={soc} format={f.percent} />
          </p>
          <dl className="fof-rows">
            <Row label="Power" value={battery.power_w} format={f.power} always />
            <Row label="Voltage" value={battery.voltage_v} format={f.volts} always />
            <Row label="Current" value={battery.current_a} format={f.amps} />
            <Row label="Time to go" value={battery.time_to_go_s} format={f.duration} />
            <Row label="Temperature" value={battery.temperature_c} format={f.celsius} />
          </dl>
        </>
      )}
    </section>
  );
}

export function Row(props: { label: string; value: number | null; format: f.Format; always?: boolean }) {
  if (props.value === null && !props.always) {
    return null;
  }
  return (
    <div className="fof-row">
      <dt>{props.label}</dt>
      <dd>
        <Eased value={props.value} format={props.format} />
      </dd>
    </div>
  );
}

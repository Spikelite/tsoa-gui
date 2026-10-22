import { useId, type CSSProperties } from "react";

import type { Battery } from "../../model/system";
import { batteryState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { flowSpeed } from "../minimal/flowSpeed";
import { StatusIcon } from "../StatusIcon";

// Ten cells, so each is a tenth of the charge, the share people read at a glance.
const CELLS_PER_ROW = 5;
const ROWS = 2;
const CELLS = CELLS_PER_ROW * ROWS;

// The battery as one block: two rows of five cells held between a single pair
// of end caps, with its name above its left end, its charge beside its right
// end and its state and readings below. Its light follows the charge: cells light from the bottom
// row's left end, a tenth of the charge each, the last one partly. Its pulse follows the power: a wave
// of light runs through the lit cells forward while the battery charges and
// backward while it discharges, faster with every tenfold increase in power,
// and stands still when it is idle.
export function Core({ battery }: { battery: Battery }) {
  const heading = useId();
  const soc = battery.soc_percent;
  const direction = battery.activity === "charging" ? "up" : battery.activity === "discharging" ? "down" : "still";
  const pulse = flowSpeed(Math.abs(battery.power_w ?? 0));
  const charge = Math.max(0, Math.min(100, soc ?? 0));
  const lit = (charge / 100) * CELLS;
  const offline = battery.status === "offline";

  // The top row is drawn first, so it holds the later cells.
  const rows = Array.from({ length: ROWS }, (_, row) => ROWS - 1 - row).map((row) =>
    Array.from({ length: CELLS_PER_ROW }, (_, column) => row * CELLS_PER_ROW + column),
  );

  return (
    <section className={`fof-core status-${battery.status}`} data-part="battery" aria-labelledby={heading}>
      {/* A conduit that would cross the name plugs into it instead. */}
      <h2 className="fof-label-block fof-core-name" data-anchor-label>
        <StatusIcon status={battery.status} />
        <span id={heading}>Battery</span>
      </h2>
      {/* Conduits plug into the block and its charge together, so none crosses the figure. */}
      <div className="fof-core-row" data-anchor="open">
        <div
          className={`fof-bank fof-${direction} fof-pulse-${pulse}`}
          style={{ "--charge": `${charge}%` } as CSSProperties}
          role="meter"
          aria-label="State of charge"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={soc ?? undefined}
        >
          <span className="fof-bank-cap" aria-hidden="true" />
          <div className="fof-bank-cells" aria-hidden="true">
            {rows.flat().map((cell) => {
              const level = Math.max(0, Math.min(1, lit - cell));
              const wave = direction === "down" ? CELLS - 1 - cell : cell;
              return (
                <span
                  key={cell}
                  className={`fof-cell${level > 0 ? " fof-cell-lit" : ""}`}
                  style={{ "--level": level.toFixed(2), "--wave": wave } as CSSProperties}
                />
              );
            })}
          </div>
          <span className="fof-bank-cap" aria-hidden="true" />
        </div>
        {!offline && (
          <p className="fof-core-figure">
            <Eased value={soc} format={f.percent} />
          </p>
        )}
      </div>
      <p className="fof-state-line">{offline ? "Not reporting" : batteryState(battery)}</p>
      {!offline && (
        <dl className="fof-rows">
          <Row label="Power" value={battery.power_w} format={f.power} always />
          <Row label="Voltage" value={battery.voltage_v} format={f.volts} always />
          <Row label="Current" value={battery.current_a} format={f.amps} />
          <Row label="Time to go" value={battery.time_to_go_s} format={f.duration} />
          <Row label="Temperature" value={battery.temperature_c} format={f.celsius} />
        </dl>
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

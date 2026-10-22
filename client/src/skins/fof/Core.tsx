import { useId, type CSSProperties, type MouseEvent } from "react";

import type { Battery } from "../../model/system";
import { batteryState } from "../describe";
import { Eased } from "../Eased";
import { openPart, partAddress } from "../partView";
import { batteryReadings, isWorded, type Reading } from "../readings";
import { StatusWords } from "./StatusPill";

// Ten cells, so each is a tenth of the charge, the share people read at a glance.
const CELLS_PER_ROW = 5;
const ROWS = 2;
const CELLS = CELLS_PER_ROW * ROWS;
// Within a row, cells light from the middle, where the conduit from above
// feeds the block, outward to the nearest unlit cell each time, left first on
// a tie. The next row starts again from its middle, under the last row's.
const FILL = [2, 1, 3, 0, 4];

// The battery as one block: two rows of five cells held between a single pair
// of end caps, with its name above its left end, its charge and state beside
// its right end and its readings below. Its light follows the charge, a
// tenth of it to each cell, the last one partly, filling from the top row's
// middle as FILL orders it. Its pulse follows the power: a wave of light runs
// through the lit cells forward while the battery charges and backward while
// it discharges, at the pace of the conduit feeding or drawing on it, and
// stands still when it is idle.
export function Core({ battery }: { battery: Battery }) {
  const heading = useId();
  const soc = battery.soc_percent;
  const direction = battery.activity === "charging" ? "up" : battery.activity === "discharging" ? "down" : "still";
  const charge = Math.max(0, Math.min(100, soc ?? 0));
  const lit = (charge / 100) * CELLS;
  const offline = battery.status === "offline";
  const readings = batteryReadings(battery);

  // The order the cells light in: each cell's place in it, top row first.
  const ranks = Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: CELLS_PER_ROW }, (_, column) => row * CELLS_PER_ROW + FILL.indexOf(column)),
  );

  // The battery opens its own page from anywhere on it; its name is the
  // link to it, for the keyboard and for a screen reader.
  const open = (event: MouseEvent) => {
    // A click on the name reaches the part's own handler too; open once.
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    openPart("battery", event.currentTarget.closest("[data-part]"));
  };

  return (
    <section className={`fof-core fof-opens status-${battery.status}`} data-part="battery" aria-labelledby={heading}
      onClick={open}>
      {/* A conduit that would cross the name plugs into it instead. */}
      <div className="fof-name-row fof-core-name" data-anchor-label>
        <h2 className="fof-label-block">
          <a id={heading} className="fof-open-link" href={partAddress("battery")} onClick={open}>Battery</a>
          <StatusWords status={battery.status} separator />
        </h2>
      </div>
      {/* Conduits plug into the block and its charge together, so none crosses the figure. */}
      <div className="fof-core-row" data-anchor="open">
        <div
          className={`fof-bank fof-${direction}`}
          style={{ "--charge": `${charge}%` } as CSSProperties}
          role="meter"
          aria-label="State of charge"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={soc ?? undefined}
        >
          <span className="fof-bank-cap" aria-hidden="true" />
          <div className="fof-bank-cells" aria-hidden="true">
            {ranks.flat().map((cell, place) => {
              const level = Math.max(0, Math.min(1, lit - cell));
              const wave = direction === "down" ? CELLS - 1 - cell : cell;
              return (
                <span
                  key={place}
                  className={`fof-cell${level > 0 ? " fof-cell-lit" : ""}`}
                  style={{ "--level": level.toFixed(2), "--wave": wave } as CSSProperties}
                />
              );
            })}
          </div>
          <span className="fof-bank-cap fof-bank-cap-end" aria-hidden="true" />
        </div>
        <div className="fof-core-side">
          {!offline && (
            <p className="fof-core-figure">
              <Eased value={readings.headline.value} format={readings.headline.format} />
            </p>
          )}
          <p className="fof-state-line">{offline ? "Not reporting" : batteryState(battery)}</p>
        </div>
      </div>
      {!offline && (
        <dl className="fof-rows">
          <Rows readings={readings.details} />
        </dl>
      )}
    </section>
  );
}

export function Rows({ readings }: { readings: Reading[] }) {
  return readings.map((reading) => {
    if (isWorded(reading)) {
      return (
        <div key={reading.label} className="fof-row">
          <dt>{reading.label}</dt>
          <dd>{reading.text}</dd>
        </div>
      );
    }
    if (reading.value === null && !reading.always) {
      return null;
    }
    return (
      <div key={reading.label} className="fof-row">
        <dt>{reading.label}</dt>
        <dd>
          <Eased value={reading.value} format={reading.format} />
        </dd>
      </div>
    );
  });
}

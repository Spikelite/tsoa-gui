import { useId, type CSSProperties } from "react";

import type { Battery } from "../../model/system";
import { batteryChecks, batteryGroups, cellDetails, type CellDetail } from "../details";
import { batteryState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { Rows } from "./Core";
import { NamePill, StatusWords } from "./StatusPill";

const CHECK_STATUS = { ok: "good", warning: "warning", alarm: "fault" } as const;
// More cells than this go on a second row of the block.
const CELLS_PER_ROW = 16;

function rowsOf(cells: CellDetail[]): CellDetail[][] {
  const rows = Math.ceil(cells.length / CELLS_PER_ROW);
  const size = Math.ceil(cells.length / Math.max(1, rows));
  return Array.from({ length: rows }, (_, row) => cells.slice(row * size, (row + 1) * size));
}

// The battery's own page, as the console would show one system in full: the
// block with every cell it reports and its charge beside its right end, each lit to its own charge between empty
// and full with its number above it and its voltage and its difference from
// the others' mean below, the lowest and highest marked and a balancing cell
// pulsing; then every reading in groups headed by rounded tags, and every
// condition the battery watches as a button in the color of where it stands.
export function BatteryDeck({ battery }: { battery: Battery }) {
  const heading = useId();
  const offline = battery.status === "offline";
  const cells = cellDetails(battery.cells, battery);
  const checks = batteryChecks(battery);
  const figure = (
    <p className="fof-deck-figure">
      <Eased value={battery.soc_percent} format={f.percent} />
    </p>
  );

  return (
    <section className={`fof-deck status-${battery.status}${cells.length > 0 ? " fof-deck-celled" : ""}`} data-part="battery" aria-labelledby={heading}>
      <div className="fof-deck-head">
        <h2 className="fof-label-block">
          <span id={heading}>Battery</span>
          <StatusWords status={battery.status} separator />
        </h2>
        <p className="fof-state-line">{offline ? "Not reporting" : batteryState(battery)}</p>
        {/* Without cells to stand beside, or on a screen too narrow for it
            beside them, the charge goes on the name's row. */}
        {!offline && <div className="fof-deck-head-charge">{figure}</div>}
      </div>

      {!offline && cells.length > 0 && (
        <div className="fof-deck-packs" role="list" aria-label="Cells">
          {rowsOf(cells).map((row, rowIndex) => (
            <div key={row[0]!.number} className="fof-deck-pack" style={{ "--cells": row.length } as CSSProperties}>
              <span className="fof-bank-cap fof-deck-cap" aria-hidden="true" />
              {row.map((cell, index) => (
                <div key={cell.number} role="listitem" className={`fof-deck-cell${cell.lowest ? " fof-deck-lowest" : ""}${
                  cell.highest ? " fof-deck-highest" : ""}${cell.balancing ? " fof-deck-balancing" : ""}`}
                  style={{ gridColumn: index + 2, "--level": (cell.level ?? 0).toFixed(3) } as CSSProperties}>
                  <span className="fof-deck-number">
                    <span className="fof-quiet">Cell </span>{String(cell.number).padStart(2, "0")}
                  </span>
                  <span className="fof-deck-pill" aria-hidden="true"><span /></span>
                  <span className="fof-deck-volts"><Eased value={cell.voltage_v} format={f.cellVolts} /></span>
                  <span className="fof-deck-offset"><Eased value={cell.offset_v} format={f.offsetMillivolts} /></span>
                  {cell.balancing && <span className="fof-quiet">, balancing</span>}
                  {cell.lowest && <span className="fof-quiet">, lowest</span>}
                  {cell.highest && <span className="fof-quiet">, highest</span>}
                </div>
              ))}
              <span className="fof-bank-cap fof-bank-cap-end fof-deck-cap" aria-hidden="true"
                style={{ gridColumn: row.length + 2 }} />
              {/* The charge beside the block's right end, as on the overview. */}
              {rowIndex === 0 && <div className="fof-deck-charge" style={{ gridColumn: row.length + 3 }}>{figure}</div>}
            </div>
          ))}
        </div>
      )}

      {!offline && (
        <div className="fof-deck-groups">
          {batteryGroups(battery).map((group, index) => (
            <section key={group.title} className="fof-deck-group" aria-label={group.title}>
              <h3 className={`fof-deck-tag fof-deck-tag-${index % 3}`}>{group.title}</h3>
              <dl className="fof-rows">
                <Rows readings={group.readings} />
              </dl>
            </section>
          ))}
          {checks.length > 0 && (
            <section className="fof-deck-group fof-deck-checks" aria-label="Alarms">
              <h3 className="fof-deck-tag fof-deck-tag-alarms">Alarms</h3>
              <ul>
                {checks.map((check) => (
                  <li key={check.name}>
                    <NamePill name={check.name} status={CHECK_STATUS[check.level]} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

import type { CSSProperties } from "react";

import type { Battery } from "../../model/system";
import { batteryGroups, cellDetails, type CellDetail } from "../details";
import { batteryState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { Deck } from "./Deck";

// More cells than this go on a second row of the block.
const CELLS_PER_ROW = 16;

function rowsOf(cells: CellDetail[]): CellDetail[][] {
  const rows = Math.ceil(cells.length / CELLS_PER_ROW);
  const size = Math.ceil(cells.length / Math.max(1, rows));
  return Array.from({ length: rows }, (_, row) => cells.slice(row * size, (row + 1) * size));
}

// The battery's own page, drawn large as the block with every cell it
// reports and its charge beside its right end. Each cell is lit to its own
// charge between empty and full, with its number above it and its voltage
// and its difference from the others' mean below; the lowest and highest
// are marked, and a cell being balanced pulses.
export function BatteryDeck({ battery }: { battery: Battery }) {
  const cells = cellDetails(battery.cells, battery);
  const figure = (
    <p className="fof-deck-figure">
      <Eased value={battery.soc_percent} format={f.percent} />
    </p>
  );

  return (
    <Deck part="battery" title="Battery" status={battery.status} state={batteryState(battery)}
      className={cells.length > 0 ? "fof-deck-celled" : undefined} groups={batteryGroups(battery)}
      checks={battery.checks}
      // Without cells to stand beside, or on a screen too narrow for it beside
      // them, the charge goes on the name's row.
      aside={<div className="fof-deck-head-charge">{figure}</div>}>
      {cells.length > 0 && (
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
    </Deck>
  );
}

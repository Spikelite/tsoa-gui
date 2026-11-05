import type { CSSProperties } from "react";

import type { Battery } from "../../model/system";
import { batteryGroups, cellDetails, type CellDetail } from "../details";
import { batteryState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { Deck } from "./Deck";

// More cells than this go on a second row of the block.
const CELLS_PER_ROW = 16;

// The difference the strip's full height stands for is the widest in the pack,
// so that millivolts can be seen, but never less than this, so that cells
// within a millivolt of each other do not look as if they have drifted apart.
const LEAST_REACH_V = 0.005;

function rowsOf(cells: CellDetail[]): CellDetail[][] {
  const rows = Math.ceil(cells.length / CELLS_PER_ROW);
  const size = Math.ceil(cells.length / Math.max(1, rows));
  return Array.from({ length: rows }, (_, row) => cells.slice(row * size, (row + 1) * size));
}

// The battery's own page, drawn large as the block with every cell it reports.
// A pack's cells sit within millivolts of each other, too close for their
// charge to tell apart, so under the block a strip draws each cell's distance
// from the mean at a scale where they can be seen. Each cell is lit to its own
// charge between empty and full, the lowest and highest are named, and a cell
// being balanced pulses.
export function BatteryDeck({ battery }: { battery: Battery }) {
  const cells = cellDetails(battery.cells, battery);
  const reach = Math.max(LEAST_REACH_V, ...cells.map((cell) => Math.abs(cell.offset_v ?? 0)));

  return (
    <Deck part="battery" title="Battery" status={battery.status} state={batteryState(battery)}
      groups={batteryGroups(battery)} checks={battery.checks} drawnWith="Cells"
      aside={(
        <div className="fof-deck-head-charge">
          <p className="fof-deck-figure"><Eased value={battery.soc_percent} format={f.percent} /></p>
        </div>
      )}>
      {cells.length > 0 && (
        <div className="fof-deck-packs" role="list" aria-label="Cells">
          {rowsOf(cells).map((row) => (
            <div key={row[0]!.number} className="fof-deck-pack" style={{ "--cells": row.length } as CSSProperties}>
              <span className="fof-bank-cap fof-deck-cap" aria-hidden="true" />
              <span className="fof-deck-mean" aria-hidden="true" />
              {row.map((cell, index) => (
                <div key={cell.number} role="listitem" className={`fof-deck-cell${cell.lowest ? " fof-deck-lowest" : ""}${
                  cell.highest ? " fof-deck-highest" : ""}${cell.balancing ? " fof-deck-balancing" : ""}`}
                  style={{
                    gridColumn: index + 2, "--level": (cell.level ?? 0).toFixed(3),
                    "--distance": (Math.abs(cell.offset_v ?? 0) / reach).toFixed(3),
                  } as CSSProperties}>
                  <span className="fof-deck-name">
                    <span className="fof-deck-word">Cell </span>{cell.number}
                    {cell.lowest && <span className="fof-deck-word">, lowest</span>}
                    {cell.highest && <span className="fof-deck-word">, highest</span>}
                    {cell.balancing && <span className="fof-quiet">, balancing</span>}
                  </span>
                  <span className="fof-deck-pill" aria-hidden="true"><span /></span>
                  <span className="fof-deck-volts"><Eased value={cell.voltage_v} format={f.cellVolts} /></span>
                  <span className={`fof-deck-offset fof-deck-offset-${(cell.offset_v ?? 0) < 0 ? "under" : "over"}`}>
                    {cell.offset_v !== null && <i aria-hidden="true" />}
                    <Eased value={cell.offset_v} format={f.offsetMillivolts} />
                  </span>
                </div>
              ))}
              <span className="fof-bank-cap fof-bank-cap-end fof-deck-cap" aria-hidden="true"
                style={{ gridColumn: row.length + 2 }} />
            </div>
          ))}
        </div>
      )}
    </Deck>
  );
}

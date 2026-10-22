import type { Battery } from "../../model/system";
import { batteryGroups, cellDetails } from "../details";
import { batteryState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { PartPage } from "./PartPage";

// The battery's own page, with every cell it reports.
export function BatteryPage({ battery }: { battery: Battery }) {
  const cells = cellDetails(battery.cells, battery);
  return (
    <PartPage part="battery" title="Battery" status={battery.status} state={batteryState(battery)}
      groups={batteryGroups(battery)} checks={battery.checks}>
      {cells.length > 0 && (
        <ol className="cells" aria-label="Cells">
          {cells.map((cell) => (
            <li key={cell.number}
              className={`cell${cell.lowest ? " cell-lowest" : ""}${cell.highest ? " cell-highest" : ""}`}>
              <span className="cell-number">Cell {cell.number}</span>
              <span className="cell-bar" aria-hidden="true">
                <span style={{ height: `${(cell.level ?? 0) * 100}%` }} />
              </span>
              <Eased value={cell.voltage_v} format={f.cellVolts} />
              <Eased value={cell.offset_v} format={f.offsetMillivolts} />
              {cell.balancing && <span className="cell-note">Balancing</span>}
              {cell.lowest && <span className="cell-note">Lowest</span>}
              {cell.highest && <span className="cell-note">Highest</span>}
            </li>
          ))}
        </ol>
      )}
    </PartPage>
  );
}

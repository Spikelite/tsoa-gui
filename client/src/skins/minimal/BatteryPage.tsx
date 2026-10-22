import { useId } from "react";

import type { Battery } from "../../model/system";
import { batteryChecks, batteryGroups, cellDetails } from "../details";
import { batteryState } from "../describe";
import { Eased } from "../Eased";
import * as f from "../format";
import { closePart } from "../partView";
import { StatusIcon } from "../StatusIcon";
import { ReadingList } from "./Panels";

const CHECK_STATUS = { ok: "good", warning: "warning", alarm: "fault" } as const;
const CHECK_WORDS = { ok: "OK", warning: "Warning", alarm: "Alarm" };

// The battery's own page: every cell it reports, every reading in groups,
// and every condition it watches.
export function BatteryPage({ battery }: { battery: Battery }) {
  const heading = useId();
  const offline = battery.status === "offline";
  const cells = cellDetails(battery.cells, battery);
  const checks = batteryChecks(battery);
  return (
    <section className={`page status-${battery.status}`} data-part="battery" aria-labelledby={heading}>
      <header className="page-header">
        <button type="button" className="page-back" onClick={closePart}>Overview</button>
        <h2 id={heading}>Battery</h2>
        <p className="panel-state">
          <StatusIcon status={battery.status} />
          <span>{offline ? "Not reporting" : batteryState(battery)}</span>
        </p>
      </header>
      {!offline && (
        <>
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
          <div className="page-groups">
            {batteryGroups(battery).map((group) => (
              <section key={group.title} className="page-group">
                <h3>{group.title}</h3>
                <ReadingList readings={group.readings} />
              </section>
            ))}
            {checks.length > 0 && (
              <section className="page-group">
                <h3>Alarms</h3>
                <ul className="checks">
                  {checks.map((check) => (
                    <li key={check.name}>
                      <StatusIcon status={CHECK_STATUS[check.level]} />
                      <span>{check.name}</span>
                      <span className="check-level">{CHECK_WORDS[check.level]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}

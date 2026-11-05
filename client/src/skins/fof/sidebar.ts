import type { PartName, Status, System } from "../../model/system";
import { alarmingFirst, partDetail } from "../details";
import * as f from "../format";
import { STATUS_LABELS } from "../status";

/** The way round the system, in the order power runs through it. */
export const SIDEBAR: PartName[] = ["grid", "generator", "solar", "inverter_charger", "battery", "ac_loads", "dc_loads"];

/** The statuses that take over the top bar, the worst highest. */
export const URGENCY: Partial<Record<Status, number>> = { attention: 1, warning: 2, fault: 3 };

export type Raised = { part: PartName; status: Status; word: string };

/** Each part that needs attention or is not reporting, with its word for why: its worst alarm, or else its status. */
export function raised(model: System): Raised[] {
  return SIDEBAR.flatMap((part) => {
    const shown = model[part];
    if (shown === null || (shown.status !== "offline" && URGENCY[shown.status] === undefined)) {
      return [];
    }
    const alarms = "alarms" in shown ? shown.alarms : [];
    const checks = "checks" in shown ? alarmingFirst(shown.checks).filter((check) => check.level !== "ok") : [];
    const worst = alarms.find((alarm) => alarm.level === "alarm") ?? alarms[0] ?? checks[0];
    return [{ part, status: shown.status, word: worst?.name ?? STATUS_LABELS[shown.status] }];
  });
}

/** What a screen with no room for the diagram's readings shows for a part. */
export function sideFigure(part: PartName, model: System): { value: number | null; format: f.Format } {
  if (part === "battery") {
    return { value: model.battery?.soc_percent ?? null, format: f.percent };
  }
  if (part === "inverter_charger") {
    return { value: model.inverter_charger?.ac_out_power_w ?? null, format: f.power };
  }
  return partDetail(part, model)?.headline ?? { value: null, format: f.power };
}

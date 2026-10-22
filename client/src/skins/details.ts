import type { AlarmCheck, Battery, Cell, PartName, System } from "../model/system";
import { batteryState } from "./describe";
import * as f from "./format";
import type { Reading } from "./readings";

// What a part's own page shows, shared by every skin as readings.ts is for
// the overview: readings in titled groups, and for a battery that reports
// them, its cells and the conditions it watches. A group with nothing known
// in it is left out.

export type DetailGroup = { title: string; readings: Reading[] };

/** The parts that have a page of their own. */
export const DETAILED: PartName[] = ["battery"];

const allowed = (value: boolean | null) => (value === null ? [] : [value ? "Allowed" : "Blocked"]);
const yesNo = (value: boolean | null) => (value === null ? [] : [value ? "Yes" : "No"]);

function worded(label: string, texts: string[]): Reading[] {
  return texts.map((text) => ({ label, text }));
}

/** Whether a group has anything to show: a worded reading, or a measured one known or always shown. */
function shown(readings: Reading[]): boolean {
  return readings.some((reading) => "text" in reading || reading.value !== null || reading.always);
}

/** A battery's cells, with the lowest and highest marked and each one's difference from the mean. */
export type CellDetail = Cell & {
  number: number;
  offset_v: number | null;
  lowest: boolean;
  highest: boolean;
  /** How full the cell is between empty and its charge voltage, 0 to 1, where the battery gives both. */
  level: number | null;
};

export function cellDetails(cells: Cell[], battery?: Battery): CellDetail[] {
  // A cell is empty at the battery's empty voltage shared among its cells,
  // and full at the voltage its cells are charged to.
  const empty = battery?.low_voltage_v != null && cells.length > 0 ? battery.low_voltage_v / cells.length : null;
  const full = battery?.max_cell_charge_voltage_v ?? null;
  const known = cells.flatMap((cell) => (cell.voltage_v === null ? [] : [cell.voltage_v]));
  const mean = known.length > 0 ? known.reduce((sum, v) => sum + v, 0) / known.length : null;
  const low = known.length > 1 ? Math.min(...known) : null;
  const high = known.length > 1 ? Math.max(...known) : null;
  return cells.map((cell, index) => ({
    ...cell,
    number: index + 1,
    offset_v: cell.voltage_v === null || mean === null ? null : cell.voltage_v - mean,
    lowest: low !== high && cell.voltage_v === low,
    highest: low !== high && cell.voltage_v === high,
    level: cell.voltage_v === null || empty === null || full === null || full <= empty
      ? null
      : Math.max(0, Math.min(1, (cell.voltage_v - empty) / (full - empty))),
  }));
}

export function batteryGroups(battery: Battery): DetailGroup[] {
  const cells = cellDetails(battery.cells, battery);
  const lowest = cells.find((cell) => cell.lowest);
  const highest = cells.find((cell) => cell.highest);
  const spread =
    battery.min_cell_voltage_v !== null && battery.max_cell_voltage_v !== null
      ? battery.max_cell_voltage_v - battery.min_cell_voltage_v
      : null;
  const history = battery.history;
  const groups: DetailGroup[] = [
    {
      title: "Charge",
      readings: [
        { label: "Charge", value: battery.soc_percent, format: f.percent, always: true },
        ...worded("State", [batteryState(battery)]),
        { label: "Charge left", value: battery.capacity_ah, format: f.ampHours },
        { label: "Capacity", value: battery.installed_capacity_ah, format: f.ampHours },
        { label: "Used since full", value: battery.consumed_ah, format: f.ampHours },
        { label: "Health", value: battery.health_percent, format: f.percent },
        { label: "Time to go", value: battery.time_to_go_s, format: f.duration },
      ],
    },
    {
      title: "Power",
      readings: [
        { label: "Power", value: battery.power_w, format: f.power, always: true },
        { label: "Voltage", value: battery.voltage_v, format: f.volts, always: true },
        { label: "Current", value: battery.current_a, format: f.amps },
      ],
    },
    {
      title: "Cells",
      readings: [
        { label: "Cells", value: cells.length > 0 ? cells.length : null, format: f.count },
        { label: lowest ? `Lowest, cell ${lowest.number}` : "Lowest", value: battery.min_cell_voltage_v, format: f.cellVolts },
        { label: highest ? `Highest, cell ${highest.number}` : "Highest", value: battery.max_cell_voltage_v, format: f.cellVolts },
        { label: "Spread", value: spread, format: f.millivolts },
        ...worded("Balancing", yesNo(battery.balancing)),
      ],
    },
    {
      title: "Temperature",
      readings: [
        { label: "Battery", value: battery.temperature_c, format: f.celsius },
        ...battery.temperatures.map((sensor) => ({ label: sensor.name, value: sensor.temperature_c, format: f.celsius })),
        { label: "Power switches", value: battery.switch_temperature_c, format: f.celsius },
      ],
    },
    {
      title: "Limits",
      readings: [
        ...worded("Charging", allowed(battery.charge_allowed)),
        ...worded("Discharging", allowed(battery.discharge_allowed)),
        { label: "Charge current", value: battery.max_charge_current_a, format: f.amps },
        ...worded("Charge set by", battery.charge_limited_by ? [battery.charge_limited_by] : []),
        { label: "Discharge current", value: battery.max_discharge_current_a, format: f.amps },
        ...worded("Discharge set by", battery.discharge_limited_by ? [battery.discharge_limited_by] : []),
        { label: "Charge voltage", value: battery.max_charge_voltage_v, format: f.volts },
        { label: "Applied charge voltage", value: battery.applied_charge_voltage_v, format: f.volts },
        { label: "Cell charge voltage", value: battery.max_cell_charge_voltage_v, format: f.cellVolts },
        { label: "Empty at", value: battery.low_voltage_v, format: f.volts },
      ],
    },
    {
      title: "History",
      readings: history === null ? [] : [
        { label: "Charge cycles", value: history.charge_cycles, format: f.count },
        { label: "Full discharges", value: history.full_discharges, format: f.count },
        { label: "Deepest discharge", value: history.deepest_discharge_ah, format: f.ampHours },
        { label: "Last discharge", value: history.last_discharge_ah, format: f.ampHours },
        { label: "Average discharge", value: history.average_discharge_ah, format: f.ampHours },
        { label: "Total drawn", value: history.total_drawn_ah, format: f.ampHours },
        { label: "Energy charged", value: history.charged_kwh, format: f.kilowattHours },
        { label: "Energy discharged", value: history.discharged_kwh, format: f.kilowattHours },
        { label: "Lowest voltage", value: history.min_voltage_v, format: f.volts },
        { label: "Highest voltage", value: history.max_voltage_v, format: f.volts },
        { label: "Lowest cell", value: history.min_cell_voltage_v, format: f.cellVolts },
        { label: "Highest cell", value: history.max_cell_voltage_v, format: f.cellVolts },
        { label: "Coldest", value: history.min_temperature_c, format: f.celsius },
        { label: "Hottest", value: history.max_temperature_c, format: f.celsius },
        { label: "Low voltage alarms", value: history.low_voltage_alarms, format: f.count },
        { label: "High voltage alarms", value: history.high_voltage_alarms, format: f.count },
        { label: "Since full charge", value: history.since_full_charge_s, format: f.duration },
      ],
    },
    {
      title: "Device",
      readings: [
        ...worded("Made by", battery.manufacturer ? [battery.manufacturer] : []),
        ...worded("Firmware", battery.firmware_version ? [battery.firmware_version] : []),
        { label: "Modules online", value: battery.modules_online, format: f.count },
        { label: "Modules offline", value: battery.modules_offline, format: f.count },
        { label: "Blocking charge", value: battery.modules_blocking_charge, format: f.count },
        { label: "Blocking discharge", value: battery.modules_blocking_discharge, format: f.count },
      ],
    },
  ];
  return groups.filter((group) => shown(group.readings));
}

/** The conditions a battery watches, those alarming first. */
export function batteryChecks(battery: Battery): AlarmCheck[] {
  const rank = { alarm: 0, warning: 1, ok: 2 };
  return [...battery.checks].sort((a, b) => rank[a.level] - rank[b.level]);
}

/** The part a page is for, if the system has it and it has a page. */
export function detailedPart(part: PartName | null, model: System): PartName | null {
  return part !== null && DETAILED.includes(part) && model[part] !== null ? part : null;
}

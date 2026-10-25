import type {
  AcCircuit, AcLoads, AcPhase, AlarmCheck, Battery, Cell, ChargerState, DcLoads, EnergyCounter, EnergyEnd, Generator,
  Grid, InverterCharger, PartName, Solar, SolarCharger, Status, System,
} from "../model/system";
import { batteryState, generatorState, gridState, inverterState, MODES, partTitle, solarState } from "./describe";
import * as f from "./format";
import { dcLoadsState, inputName, timeLeftReadings, type Measured, type Reading } from "./readings";

// What a part's own page shows, shared by every skin as readings.ts is for
// the overview: readings in titled groups, and for a battery that reports
// them, its cells and the conditions it watches. A group with nothing known
// in it is left out.

export type DetailGroup = { title: string; readings: Reading[] };

/** The parts that have a page of their own. */
export const DETAILED: PartName[] = [
  "grid", "generator", "inverter_charger", "battery", "solar", "ac_loads", "dc_loads",
];

const allowed = (value: boolean | null) => (value === null ? [] : [value ? "Allowed" : "Blocked"]);
const yesNo = (value: boolean | null) => (value === null ? [] : [value ? "Yes" : "No"]);
const onOff = (value: boolean | null) => (value === null ? [] : [value ? "On" : "Off"]);

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
        ...timeLeftReadings(battery),
        { label: "Cut-off", value: battery.cut_off_soc_percent, format: f.percent },
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

/** The conditions a part watches, those alarming first. */
export function alarmingFirst(checks: AlarmCheck[]): AlarmCheck[] {
  const rank = { alarm: 0, warning: 1, ok: 2 };
  return [...checks].sort((a, b) => rank[a.level] - rank[b.level]);
}

/** An AC connection's phases as readings: plainly for one phase, each named for more. */
function phaseReadings(phases: AcPhase[]): Reading[] {
  const name = (phase: AcPhase, label: string) => (phases.length > 1 ? `${phase.phase} ${label.toLowerCase()}` : label);
  return phases.flatMap((phase) => [
    { label: name(phase, "Voltage"), value: phase.voltage_v, format: f.volts },
    { label: name(phase, "Current"), value: phase.current_a, format: f.amps },
    ...(phases.length > 1 ? [{ label: name(phase, "Power"), value: phase.power_w, format: f.power }] : []),
    { label: name(phase, "Apparent power"), value: phase.apparent_power_va, format: f.voltAmps },
    { label: name(phase, "Frequency"), value: phase.frequency_hz, format: f.hertz },
  ]);
}

function energyEnd(end: EnergyEnd, model: System): string {
  return end === "input_1" ? inputName(1, model) : end === "input_2" ? inputName(2, model)
    : end === "battery" ? "Battery" : "Loads";
}

export function inverterGroups(inverter: InverterCharger, model: System): DetailGroup[] {
  const inUse = inverter.active_input;
  const load = inverter.ac_out_power_w !== null && inverter.rated_power_w
    ? (inverter.ac_out_power_w / inverter.rated_power_w) * 100
    : null;
  const groups: DetailGroup[] = [
    {
      title: "Output",
      readings: [
        { label: "Power", value: inverter.ac_out_power_w, format: f.power, always: true },
        ...(inverter.output_phases.length === 1 ? [] : [
          { label: "Apparent power", value: inverter.output_apparent_power_va, format: f.voltAmps },
        ]),
        { label: "Load", value: load, format: f.percent },
        { label: "Rated power", value: inverter.rated_power_w, format: f.power },
        ...phaseReadings(inverter.output_phases),
      ],
    },
    {
      title: "Input",
      readings: [
        ...worded("In use", inUse ? [inputName(inUse, model)] : []),
        ...worded("Connected", yesNo(inverter.input_connected)),
        { label: "Power", value: inverter.ac_in_power_w, format: f.power },
        { label: "Current limit", value: inverter.input_current_limit_a, format: f.amps },
        ...phaseReadings(inverter.input_phases),
      ],
    },
    {
      title: "Battery side",
      readings: [
        { label: "Voltage", value: inverter.dc_voltage_v, format: f.volts },
        { label: "Current", value: inverter.charge_current_a, format: f.amps },
        { label: "Power", value: inverter.dc_power_w, format: f.power },
        { label: "Ripple", value: inverter.battery_ripple_v, format: f.millivolts },
        { label: "Most charge current", value: inverter.max_charge_current_a, format: f.amps },
      ],
    },
    {
      title: "Battery limits",
      readings: [
        { label: "Charge voltage", value: inverter.battery_charge_voltage_v, format: f.volts },
        { label: "Charge current", value: inverter.battery_charge_current_a, format: f.amps },
        { label: "Discharge current", value: inverter.battery_discharge_current_a, format: f.amps },
        { label: "Stops inverting at", value: inverter.battery_low_voltage_v, format: f.volts },
      ],
    },
    {
      title: "Conditions",
      readings: [
        ...worded("State", [inverterState(inverter)]),
        ...worded("Charging disabled", yesNo(inverter.charging_disabled)),
        ...worded("Too cold to charge", yesNo(inverter.too_cold_to_charge)),
        ...worded("Too low to invert", yesNo(inverter.too_low_to_invert)),
      ],
    },
    {
      title: "Settings",
      readings: [
        ...worded("Mode", inverter.mode === null ? [] : [MODES[inverter.mode]]),
        ...worded("Power assist", onOff(inverter.power_assist)),
        ...worded("UPS function", onOff(inverter.ups_function)),
        ...worded("Weak input", onOff(inverter.weak_input)),
        { label: "Output voltage", value: inverter.output_voltage_setting_v, format: f.volts },
      ],
    },
    {
      title: "Energy",
      readings: inverter.energy.map((counter) => ({
        label: `${energyEnd(counter.source, model)} to ${energyEnd(counter.target, model)}`,
        value: counter.kwh,
        format: f.kilowattHours,
      })),
    },
    {
      title: "Device",
      readings: [
        ...worded("Model", inverter.product_name ? [inverter.product_name] : []),
        ...worded("Firmware", inverter.firmware_version ? [inverter.firmware_version] : []),
        { label: "Units", value: inverter.units, format: f.count },
        { label: "Phases", value: inverter.phases, format: f.count },
        { label: "Running for", value: inverter.uptime_s, format: f.duration },
      ],
    },
  ];
  return groups.filter((group) => shown(group.readings));
}

/** The AC input a supply is wired to, where no other known supply shares it. */
function ownInput(part: "grid" | "generator", model: System): 1 | 2 | null {
  const input = model[part]?.ac_input ?? null;
  const other = part === "grid" ? model.generator : model.grid;
  return input !== null && other?.ac_input !== input ? input : null;
}

/** An energy counter as seen from one of its ends. */
function energyFrom(end: EnergyEnd, model: System) {
  return (counter: EnergyCounter): Reading[] =>
    counter.source === end
      ? [{ label: `To ${energyEnd(counter.target, model).toLowerCase()}`, value: counter.kwh, format: f.kilowattHours }]
      : counter.target === end
        ? [{ label: `From ${energyEnd(counter.source, model).toLowerCase()}`, value: counter.kwh, format: f.kilowattHours }]
        : [];
}

/**
 * What the inverter/charger knows of a supply on an input of its own: what
 * arrives at the input while the supply is the one in use, and the energy
 * it has carried from the input and to it.
 */
function supplyGroups(part: "grid" | "generator", model: System): DetailGroup[] {
  const inverter = model.inverter_charger;
  const input = ownInput(part, model);
  if (inverter === null || input === null) {
    return [];
  }
  const inUse = inverter.active_input === input && inverter.input_connected !== false;
  return [
    {
      title: "At the inverter",
      readings: inUse ? [
        { label: "Power", value: inverter.ac_in_power_w, format: f.power },
        { label: "Current limit", value: inverter.input_current_limit_a, format: f.amps },
        ...phaseReadings(inverter.input_phases),
      ] : [],
    },
    { title: "Energy", readings: inverter.energy.flatMap(energyFrom(`input_${input}`, model)) },
  ];
}

export function gridGroups(grid: Grid, model: System): DetailGroup[] {
  const groups: DetailGroup[] = [
    {
      title: "Supply",
      readings: [
        { label: "Power", value: grid.power_w, format: f.power, always: true },
        { label: "Voltage", value: grid.voltage_v, format: f.volts },
        { label: "Current", value: grid.current_a, format: f.amps },
        { label: "Frequency", value: grid.frequency_hz, format: f.hertz },
      ],
    },
    {
      title: "Connection",
      readings: [
        ...worded("Connected", yesNo(grid.connected)),
        ...worded("Wired to", grid.ac_input === null ? [] : [`AC input ${grid.ac_input}`]),
        { label: "Input limit", value: grid.input_current_limit_a, format: f.amps },
      ],
    },
    ...supplyGroups("grid", model),
  ];
  return groups.filter((group) => shown(group.readings));
}

export function generatorGroups(generator: Generator, model: System): DetailGroup[] {
  const groups: DetailGroup[] = [
    {
      title: "Output",
      readings: [
        { label: "Power", value: generator.power_w, format: f.power, always: true },
        ...worded("Running", yesNo(generator.running)),
        { label: "Running for", value: generator.run_time_s, format: f.duration },
        ...worded("Wired to", generator.ac_input === null ? [] : [`AC input ${generator.ac_input}`]),
      ],
    },
    ...supplyGroups("generator", model),
  ];
  return groups.filter((group) => shown(group.readings));
}

const CHARGER_STATES: Record<ChargerState, string> = {
  off: "Off", fault: "Fault", bulk: "Bulk", absorption: "Absorption", float: "Float", storage: "Storage",
  equalize: "Equalize", starting: "Starting", external_control: "External control", other: "Other",
};

function chargerGroup(charger: SolarCharger): DetailGroup {
  if (charger.status === "offline") {
    return { title: charger.name, readings: worded("State", ["Not reporting"]) };
  }
  return {
    title: charger.name,
    readings: [
      { label: "Power", value: charger.power_w, format: f.power, always: true },
      ...worded("State", charger.state === null ? [] : [CHARGER_STATES[charger.state]]),
      { label: "Panel voltage", value: charger.pv_voltage_v, format: f.volts },
      { label: "Panel current", value: charger.pv_current_a, format: f.amps },
      { label: "Battery voltage", value: charger.battery_voltage_v, format: f.volts },
      { label: "Charge current", value: charger.battery_current_a, format: f.amps },
      { label: "Most today", value: charger.max_power_today_w, format: f.power },
      { label: "Today", value: charger.yield_today_kwh, format: f.kilowattHours },
      { label: "Since reset", value: charger.yield_total_kwh, format: f.kilowattHours },
      ...worded("Error", charger.error === null ? [] : [charger.error === 0 ? "None" : `Code ${charger.error}`]),
    ],
  };
}

export function solarGroups(solar: Solar): DetailGroup[] {
  const reporting = solar.chargers.filter((charger) => charger.status !== "offline").length;
  const groups: DetailGroup[] = [
    {
      title: "Total",
      readings: [
        { label: "Power", value: solar.power_w, format: f.power, always: true },
        { label: "Today", value: solar.yield_today_kwh, format: f.kilowattHours },
        { label: "Chargers", value: solar.chargers.length > 0 ? solar.chargers.length : null, format: f.count },
        { label: "Reporting", value: solar.chargers.length > 1 ? reporting : null, format: f.count },
      ],
    },
    ...solar.chargers.map(chargerGroup),
  ];
  return groups.filter((group) => shown(group.readings));
}

/** A circuit its own meter measures, as a group of its readings. */
function circuitGroup(circuit: AcCircuit): DetailGroup {
  if (circuit.status === "offline") {
    return { title: circuit.name, readings: worded("State", ["Not reporting"]) };
  }
  return {
    title: circuit.name,
    readings: [
      { label: "Power", value: circuit.power_w, format: f.power, always: true },
      { label: "Voltage", value: circuit.voltage_v, format: f.volts },
      { label: "Current", value: circuit.current_a, format: f.amps },
      { label: "Power factor", value: circuit.power_factor, format: f.powerFactor },
      { label: "Energy used", value: circuit.energy_kwh, format: f.kilowattHours },
      ...phaseReadings(circuit.phases),
    ],
  };
}

export function acLoadsGroups(loads: AcLoads, model: System): DetailGroup[] {
  const inverter = model.inverter_charger;
  const groups: DetailGroup[] = [
    {
      title: "Loads",
      readings: [
        { label: "Power", value: loads.power_w, format: f.power, always: true },
        { label: "Voltage", value: loads.voltage_v, format: f.volts },
        { label: "Current", value: loads.current_a, format: f.amps },
        { label: "Frequency", value: loads.frequency_hz, format: f.hertz },
      ],
    },
    {
      title: "Fed from",
      readings: [
        { label: "The inverter", value: loads.on_output_w, format: f.power },
        { label: "The supply side", value: loads.on_input_w, format: f.power },
      ],
    },
    // Each circuit's own meter is apart from the totals above, so they need not add up to them.
    ...loads.circuits.map(circuitGroup),
    {
      title: "Phases",
      readings: inverter !== null && inverter.output_phases.length > 1 ? phaseReadings(inverter.output_phases) : [],
    },
    { title: "Energy", readings: (inverter?.energy ?? []).flatMap(energyFrom("output", model)) },
  ];
  return groups.filter((group) => shown(group.readings));
}

const MEASURED_BY = { meter: "A meter", calculation: "Worked out from the others" };

export function dcLoadsGroups(loads: DcLoads, model: System): DetailGroup[] {
  // The loads hang on the battery, so they draw their power at its voltage.
  const voltage = model.battery?.voltage_v ?? null;
  const current = loads.power_w !== null && voltage ? loads.power_w / voltage : null;
  const groups: DetailGroup[] = [
    {
      title: "Loads",
      readings: [
        { label: "Power", value: loads.power_w, format: f.power, always: true },
        { label: "Current", value: current, format: f.amps },
        { label: "Voltage", value: voltage, format: f.volts },
        ...worded("Measured by", loads.measured_by === null ? [] : [MEASURED_BY[loads.measured_by]]),
      ],
    },
  ];
  return groups.filter((group) => shown(group.readings));
}

/** A page drawn the same way for any part: every part's but the battery's and the inverter/charger's. */
export type PartDetail = { title: string; status: Status; state: string; headline: Measured; groups: DetailGroup[] };

export function partDetail(part: PartName, model: System): PartDetail | null {
  const power = (value: number | null): Measured => ({ label: "Power", value, format: f.power, always: true });
  const title = partTitle(part, model);
  switch (part) {
    case "grid":
      return model.grid && {
        title, status: model.grid.status, state: gridState(model.grid), headline: power(model.grid.power_w),
        groups: gridGroups(model.grid, model),
      };
    case "generator":
      return model.generator && {
        title, status: model.generator.status, state: generatorState(model.generator),
        headline: power(model.generator.power_w), groups: generatorGroups(model.generator, model),
      };
    case "solar":
      return model.solar && {
        title, status: model.solar.status, state: solarState(model.solar), headline: power(model.solar.power_w),
        groups: solarGroups(model.solar),
      };
    case "ac_loads":
      return model.ac_loads && {
        title, status: model.ac_loads.status, state: "In use", headline: power(model.ac_loads.power_w),
        groups: acLoadsGroups(model.ac_loads, model),
      };
    case "dc_loads":
      return model.dc_loads && {
        title, status: model.dc_loads.status, state: dcLoadsState(model.dc_loads),
        headline: power(model.dc_loads.power_w), groups: dcLoadsGroups(model.dc_loads, model),
      };
    default:
      return null;
  }
}

/** The part a page is for, if the system has it and it has a page. */
export function detailedPart(part: PartName | null, model: System): PartName | null {
  return part !== null && DETAILED.includes(part) && model[part] !== null ? part : null;
}

/* Generated from system.schema.json by `npm run model`. Do not edit by hand. */

/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "Status".
 */
export type Status = "good" | "normal" | "attention" | "warning" | "fault" | "offline";
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "InverterMode".
 */
export type InverterMode = "on" | "off" | "charger_only" | "inverter_only";
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "InverterState".
 */
export type InverterState =
  | "off"
  | "low_power"
  | "fault"
  | "bulk"
  | "absorption"
  | "float"
  | "storage"
  | "equalize"
  | "passthrough"
  | "inverting"
  | "power_assist"
  | "power_supply"
  | "sustain"
  | "external_control"
  | "other";
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "EnergyEnd".
 */
export type EnergyEnd = "input_1" | "input_2" | "battery" | "output";
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "ChargerState".
 */
export type ChargerState =
  | "off"
  | "fault"
  | "bulk"
  | "absorption"
  | "float"
  | "storage"
  | "equalize"
  | "starting"
  | "external_control"
  | "other";
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "FlowEnd".
 */
export type FlowEnd = PartName | "dc_bus";
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "PartName".
 */
export type PartName = "grid" | "generator" | "inverter_charger" | "battery" | "solar" | "ac_loads" | "dc_loads";

/**
 * The whole system as the browser receives it.
 */
export interface System {
  /**
   * False when the server has stopped hearing from the device; every reading is then the last one known.
   */
  live: boolean;
  grid: Grid | null;
  generator: Generator | null;
  inverter_charger: InverterCharger | null;
  battery: Battery | null;
  solar: Solar | null;
  ac_loads: AcLoads | null;
  dc_loads: DcLoads | null;
  flows: Flow[];
}
/**
 * The AC supply the system connects to: a utility grid or shore power.
 *
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "Grid".
 */
export interface Grid {
  /**
   * How this part is doing. Every skin gives each level the same color: good green, normal blue, attention yellow, warning orange, fault red, offline black, always paired with an icon or a label so color is never the only signal.
   */
  status: Status;
  /**
   * Whether the supply is a utility grid or shore power.
   */
  kind: "grid" | "shore";
  /**
   * Which of the inverter/charger's AC inputs the supply is wired to, where the system says.
   */
  ac_input: (1 | 2) | null;
  /**
   * Whether the supply is present and connected now.
   */
  connected: boolean | null;
  /**
   * Power drawn from the supply. Negative when power is fed back into it.
   */
  power_w: number | null;
  voltage_v: number | null;
  current_a: number | null;
  frequency_hz: number | null;
  /**
   * The most current the inverter/charger will draw from the supply.
   */
  input_current_limit_a: number | null;
}
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "Generator".
 */
export interface Generator {
  /**
   * How this part is doing. Every skin gives each level the same color: good green, normal blue, attention yellow, warning orange, fault red, offline black, always paired with an icon or a label so color is never the only signal.
   */
  status: Status;
  /**
   * Which of the inverter/charger's AC inputs the generator is wired to, where the system says.
   */
  ac_input: (1 | 2) | null;
  running: boolean | null;
  /**
   * Power the generator supplies.
   */
  power_w: number | null;
  /**
   * How long the generator has been running this time.
   */
  run_time_s: number | null;
}
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "InverterCharger".
 */
export interface InverterCharger {
  /**
   * How this part is doing. Every skin gives each level the same color: good green, normal blue, attention yellow, warning orange, fault red, offline black, always paired with an icon or a label so color is never the only signal.
   */
  status: Status;
  /**
   * The mode it has been set to.
   */
  mode: InverterMode | null;
  /**
   * What it is doing now.
   */
  state: InverterState | null;
  /**
   * Power coming in on its AC input. Negative when it feeds power back out of the input.
   */
  ac_in_power_w: number | null;
  /**
   * Power going out of its AC output to the loads.
   */
  ac_out_power_w: number | null;
  /**
   * DC current into the battery. Negative when it draws from the battery to invert.
   */
  charge_current_a: number | null;
  /**
   * DC power into the battery. Negative when it draws from the battery to invert.
   */
  dc_power_w: number | null;
  /**
   * Alarms and warnings active now.
   */
  alarms: Alarm[];
  /**
   * How many AC inputs it has: one on most models, two on those that switch between two supplies, such as shore power and a generator.
   */
  ac_inputs: number | null;
  /**
   * The AC input it is taking power from now, if any.
   */
  active_input: (1 | 2) | null;
  /**
   * The model, as the unit reports it.
   */
  product_name: string | null;
  firmware_version: string | null;
  /**
   * The most power it is rated to invert.
   */
  rated_power_w: number | null;
  /**
   * How many phases it supplies.
   */
  phases: number | null;
  /**
   * How many units work together as this one inverter/charger.
   */
  units: number | null;
  /**
   * Time since the unit last started.
   */
  uptime_s: number | null;
  /**
   * Whether the AC input in use is connected now.
   */
  input_connected: boolean | null;
  /**
   * The most current it will draw from the AC input in use.
   */
  input_current_limit_a: number | null;
  /**
   * Each phase of the AC input in use.
   */
  input_phases: AcPhase[];
  /**
   * Each phase of the AC output.
   */
  output_phases: AcPhase[];
  output_apparent_power_va: number | null;
  /**
   * Battery voltage at its DC terminals.
   */
  dc_voltage_v: number | null;
  /**
   * The most current its charger can give.
   */
  max_charge_current_a: number | null;
  /**
   * Ripple on the battery voltage, which grows with cables or a battery too small for the load.
   */
  battery_ripple_v: number | null;
  /**
   * The charge voltage it holds to, as the system sets it for the battery.
   */
  battery_charge_voltage_v: number | null;
  /**
   * The charge current limit it follows, as the system sets it for the battery.
   */
  battery_charge_current_a: number | null;
  /**
   * The discharge current limit it follows, as the system sets it for the battery.
   */
  battery_discharge_current_a: number | null;
  /**
   * The battery voltage it stops inverting at.
   */
  battery_low_voltage_v: number | null;
  charging_disabled: boolean | null;
  too_cold_to_charge: boolean | null;
  /**
   * Whether the battery's charge is too low for it to invert.
   */
  too_low_to_invert: boolean | null;
  /**
   * Whether it adds battery power to the supply when the loads need more than the input limit allows.
   */
  power_assist: boolean | null;
  ups_function: boolean | null;
  /**
   * Whether it is set to accept a weak or distorted supply.
   */
  weak_input: boolean | null;
  /**
   * The voltage it is set to invert at.
   */
  output_voltage_setting_v: number | null;
  /**
   * Energy moved along each route.
   */
  energy: EnergyCounter[];
  /**
   * Every condition it watches for, alarming or not.
   */
  checks: AlarmCheck[];
  /**
   * Its front panel lights.
   */
  leds: Led[];
}
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "Alarm".
 */
export interface Alarm {
  /**
   * What the alarm is about, worded for the person reading it.
   */
  name: string;
  level: "warning" | "alarm";
}
/**
 * One phase of an AC connection.
 *
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "AcPhase".
 */
export interface AcPhase {
  /**
   * The phase's name, L1, L2 or L3.
   */
  phase: string;
  voltage_v: number | null;
  current_a: number | null;
  power_w: number | null;
  apparent_power_va: number | null;
  frequency_hz: number | null;
}
/**
 * Energy the inverter/charger has moved along one route, since its counters were last reset.
 *
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "EnergyCounter".
 */
export interface EnergyCounter {
  source: EnergyEnd;
  target: EnergyEnd;
  kwh: number;
}
/**
 * One condition a part watches for, and where it stands now.
 *
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "AlarmCheck".
 */
export interface AlarmCheck {
  /**
   * What the part watches, worded for the person reading it.
   */
  name: string;
  level: "ok" | "warning" | "alarm";
}
/**
 * One of the inverter/charger's front panel lights.
 *
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "Led".
 */
export interface Led {
  name: string;
  state: "off" | "on" | "blinking";
}
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "Battery".
 */
export interface Battery {
  /**
   * How this part is doing. Every skin gives each level the same color: good green, normal blue, attention yellow, warning orange, fault red, offline black, always paired with an icon or a label so color is never the only signal.
   */
  status: Status;
  /**
   * State of charge.
   */
  soc_percent: number | null;
  voltage_v: number | null;
  /**
   * Positive while charging, negative while discharging.
   */
  current_a: number | null;
  /**
   * Positive while charging, negative while discharging.
   */
  power_w: number | null;
  temperature_c: number | null;
  /**
   * Time left at the present discharge rate. Unknown while charging or idle.
   */
  time_to_go_s: number | null;
  activity: ("idle" | "charging" | "discharging") | null;
  /**
   * Charge voltage limit.
   */
  max_charge_voltage_v: number | null;
  /**
   * Charge current limit.
   */
  max_charge_current_a: number | null;
  /**
   * Discharge current limit.
   */
  max_discharge_current_a: number | null;
  /**
   * Lowest cell voltage, for batteries that report their cells.
   */
  min_cell_voltage_v: number | null;
  /**
   * Highest cell voltage, for batteries that report their cells.
   */
  max_cell_voltage_v: number | null;
  /**
   * Alarms and warnings active now.
   */
  alarms: Alarm[];
  /**
   * Every condition the battery watches for, alarming or not.
   */
  checks: AlarmCheck[];
  /**
   * Charge left, in amp-hours.
   */
  capacity_ah: number | null;
  /**
   * Capacity when full.
   */
  installed_capacity_ah: number | null;
  /**
   * Charge drawn since the battery was last full.
   */
  consumed_ah: number | null;
  /**
   * State of health: capacity now against when new.
   */
  health_percent: number | null;
  /**
   * Each cell, for batteries that report them.
   */
  cells: Cell[];
  /**
   * Whether the battery is balancing its cells now.
   */
  balancing: boolean | null;
  /**
   * The battery's own temperature sensors, each by name.
   */
  temperatures: TemperatureSensor[];
  /**
   * Temperature of the battery's power switches, which open to stop charge or discharge.
   */
  switch_temperature_c: number | null;
  /**
   * Whether the battery lets itself be charged now.
   */
  charge_allowed: boolean | null;
  /**
   * Whether the battery lets itself be discharged now.
   */
  discharge_allowed: boolean | null;
  /**
   * What is setting the charge current limit now, in the battery's own words.
   */
  charge_limited_by: string | null;
  /**
   * What is setting the discharge current limit now, in the battery's own words.
   */
  discharge_limited_by: string | null;
  /**
   * The charge voltage the system applies, which a system limit can hold below the battery's own charge voltage limit.
   */
  applied_charge_voltage_v: number | null;
  /**
   * The highest voltage a cell is charged to.
   */
  max_cell_charge_voltage_v: number | null;
  /**
   * The voltage the battery counts as empty.
   */
  low_voltage_v: number | null;
  modules_online: number | null;
  modules_offline: number | null;
  modules_blocking_charge: number | null;
  modules_blocking_discharge: number | null;
  /**
   * Who made the battery or its management system.
   */
  manufacturer: string | null;
  firmware_version: string | null;
  history: BatteryHistory | null;
}
/**
 * One cell of a battery that reports its cells, in the order the battery numbers them.
 *
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "Cell".
 */
export interface Cell {
  voltage_v: number | null;
  /**
   * Whether the battery is bleeding charge from this cell to bring it level with the rest.
   */
  balancing: boolean | null;
}
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "TemperatureSensor".
 */
export interface TemperatureSensor {
  /**
   * The sensor's name as the battery reports it.
   */
  name: string;
  temperature_c: number | null;
}
/**
 * What the battery has kept track of since it was last reset. Amounts drawn are positive.
 *
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "BatteryHistory".
 */
export interface BatteryHistory {
  charge_cycles: number | null;
  full_discharges: number | null;
  deepest_discharge_ah: number | null;
  last_discharge_ah: number | null;
  average_discharge_ah: number | null;
  total_drawn_ah: number | null;
  charged_kwh: number | null;
  discharged_kwh: number | null;
  min_voltage_v: number | null;
  max_voltage_v: number | null;
  min_cell_voltage_v: number | null;
  max_cell_voltage_v: number | null;
  min_temperature_c: number | null;
  max_temperature_c: number | null;
  low_voltage_alarms: number | null;
  high_voltage_alarms: number | null;
  /**
   * Time since the battery was last fully charged.
   */
  since_full_charge_s: number | null;
}
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "Solar".
 */
export interface Solar {
  /**
   * How this part is doing. Every skin gives each level the same color: good green, normal blue, attention yellow, warning orange, fault red, offline black, always paired with an icon or a label so color is never the only signal.
   */
  status: Status;
  /**
   * Total solar power, from every charger.
   */
  power_w: number | null;
  /**
   * Total energy harvested today.
   */
  yield_today_kwh: number | null;
  chargers: SolarCharger[];
}
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "SolarCharger".
 */
export interface SolarCharger {
  /**
   * How this part is doing. Every skin gives each level the same color: good green, normal blue, attention yellow, warning orange, fault red, offline black, always paired with an icon or a label so color is never the only signal.
   */
  status: Status;
  /**
   * The charger's name as the device reports it.
   */
  name: string;
  power_w: number | null;
  state: ChargerState | null;
  yield_today_kwh: number | null;
  /**
   * Voltage from the panels.
   */
  pv_voltage_v: number | null;
  /**
   * Current from the panels.
   */
  pv_current_a: number | null;
  /**
   * Voltage at the charger's battery terminals.
   */
  battery_voltage_v: number | null;
  /**
   * Current the charger gives the battery.
   */
  battery_current_a: number | null;
  /**
   * The most power it has given today.
   */
  max_power_today_w: number | null;
  /**
   * Energy it has harvested since its counter was reset.
   */
  yield_total_kwh: number | null;
  /**
   * The charger's own error code, 0 when there is none.
   */
  error: number | null;
}
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "AcLoads".
 */
export interface AcLoads {
  /**
   * How this part is doing. Every skin gives each level the same color: good green, normal blue, attention yellow, warning orange, fault red, offline black, always paired with an icon or a label so color is never the only signal.
   */
  status: Status;
  /**
   * Total power used by AC loads.
   */
  power_w: number | null;
  /**
   * Loads on the inverter/charger's AC output, which the battery keeps powered.
   */
  on_output_w: number | null;
  /**
   * Loads on the supply side of the inverter/charger, which lose power with the supply.
   */
  on_input_w: number | null;
  /**
   * Voltage on the inverter/charger's AC output, the first phase on a multi-phase system: what the loads on it see, from the supply when it passes through, from the inverter when it inverts.
   */
  voltage_v: number | null;
  /**
   * Current on the inverter/charger's AC output, all phases together.
   */
  current_a: number | null;
  /**
   * Frequency on the inverter/charger's AC output.
   */
  frequency_hz: number | null;
}
/**
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "DcLoads".
 */
export interface DcLoads {
  /**
   * How this part is doing. Every skin gives each level the same color: good green, normal blue, attention yellow, warning orange, fault red, offline black, always paired with an icon or a label so color is never the only signal.
   */
  status: Status;
  /**
   * Total power used by DC loads.
   */
  power_w: number | null;
  /**
   * Whether a DC meter measures the loads or the device works them out from other readings.
   */
  measured_by: ("meter" | "calculation") | null;
}
/**
 * Power moving from one part to another, drawn as animated flow between their panels.
 *
 * This interface was referenced by `System`'s JSON-Schema
 * via the `definition` "Flow".
 */
export interface Flow {
  source: FlowEnd;
  target: FlowEnd;
  /**
   * Power moving from source to target. Never negative.
   */
  power_w: number;
}

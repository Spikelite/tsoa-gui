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
  source: PartName;
  target: PartName;
  /**
   * Power moving from source to target. Never negative.
   */
  power_w: number;
}

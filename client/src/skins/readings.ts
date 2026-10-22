import type { AcLoads, Battery, DcLoads, Generator, Grid, InverterCharger, Solar, System } from "../model/system";
import { MODES, partTitle } from "./describe";
import * as f from "./format";

// What each part shows, shared by every skin so that a skin changes how the
// readings look and never which of them there are. Each part has a headline,
// the reading a skin draws largest, and its details.

/** A measured reading. One the system does not report is left out unless `always`. */
export type Measured = { label: string; value: number | null; format: f.Format; always?: boolean };
/** A reading that is a word rather than a number, left out where the system does not report it. */
export type Worded = { label: string; text: string };
export type Reading = Measured | Worded;

export type Readings = { headline: Measured; details: Reading[] };

export const isWorded = (reading: Reading): reading is Worded => "text" in reading;

export function gridReadings(grid: Grid): Readings {
  return {
    headline: { label: "Power", value: grid.power_w, format: f.power, always: true },
    details: [
      { label: "Voltage", value: grid.voltage_v, format: f.volts },
      { label: "Current", value: grid.current_a, format: f.amps },
      { label: "Frequency", value: grid.frequency_hz, format: f.hertz },
      { label: "Input limit", value: grid.input_current_limit_a, format: f.amps },
    ],
  };
}

export function generatorReadings(generator: Generator): Readings {
  return {
    headline: { label: "Power", value: generator.power_w, format: f.power, always: true },
    details: [{ label: "Running for", value: generator.run_time_s, format: f.duration }],
  };
}

/** The supply wired to an AC input, or the input itself where no known supply is. */
function inputName(input: 1 | 2, model: System): string {
  if (model.grid?.ac_input === input) {
    return partTitle("grid", model);
  }
  if (model.generator?.ac_input === input) {
    return "Generator";
  }
  return `AC input ${input}`;
}

export function inverterReadings(inverter: InverterCharger, model: System): Readings {
  const inUse = (inverter.ac_inputs ?? 1) >= 2 && inverter.active_input ? inverter.active_input : null;
  return {
    headline: { label: "AC out", value: inverter.ac_out_power_w, format: f.power, always: true },
    details: [
      ...(inverter.mode === null ? [] : [{ label: "Mode", text: MODES[inverter.mode] }]),
      ...(inUse === null ? [] : [{ label: "Input in use", text: inputName(inUse, model) }]),
      { label: "AC in", value: inverter.ac_in_power_w, format: f.power },
      { label: "Charge current", value: inverter.charge_current_a, format: f.amps },
    ],
  };
}

export function batteryReadings(battery: Battery): Readings {
  const spread =
    battery.min_cell_voltage_v !== null && battery.max_cell_voltage_v !== null
      ? battery.max_cell_voltage_v - battery.min_cell_voltage_v
      : null;
  return {
    headline: { label: "Charge", value: battery.soc_percent, format: f.percent, always: true },
    details: [
      { label: "Power", value: battery.power_w, format: f.power, always: true },
      { label: "Voltage", value: battery.voltage_v, format: f.volts, always: true },
      { label: "Current", value: battery.current_a, format: f.amps },
      { label: "Temperature", value: battery.temperature_c, format: f.celsius },
      { label: "Time to go", value: battery.time_to_go_s, format: f.duration },
      { label: "Charge limit", value: battery.max_charge_current_a, format: f.amps },
      { label: "Discharge limit", value: battery.max_discharge_current_a, format: f.amps },
      { label: "Cell spread", value: spread, format: f.millivolts },
    ],
  };
}

/** The solar readings; each charger's own power is listed apart, where there is more than one. */
export function solarReadings(solar: Solar): Readings {
  return {
    headline: { label: "Power", value: solar.power_w, format: f.power, always: true },
    details: [{ label: "Today", value: solar.yield_today_kwh, format: f.kilowattHours }],
  };
}

export function acLoadsReadings(loads: AcLoads): Readings {
  return {
    headline: { label: "Power", value: loads.power_w, format: f.power, always: true },
    details: [
      { label: "Voltage", value: loads.voltage_v, format: f.volts },
      { label: "Current", value: loads.current_a, format: f.amps },
      { label: "Frequency", value: loads.frequency_hz, format: f.hertz },
      { label: "On the inverter", value: loads.on_output_w, format: f.power },
      { label: "On the supply side", value: loads.on_input_w, format: f.power },
    ],
  };
}

export function dcLoadsReadings(loads: DcLoads): Readings {
  return {
    headline: { label: "Power", value: loads.power_w, format: f.power, always: true },
    details: [],
  };
}

/** How the DC loads' power is known. */
export function dcLoadsState(loads: DcLoads): string {
  return loads.measured_by === "meter" ? "Metered" : loads.measured_by === "calculation" ? "Calculated" : "In use";
}

import type { System } from "../model/system";

// An invented system for tests: shore power, a battery charging from it and
// from solar, one of two solar chargers not reporting, and no generator.
export const system: System = {
  live: true,
  grid: {
    status: "normal",
    kind: "shore",
    connected: true,
    power_w: 1250,
    voltage_v: 231.5,
    current_a: 5.4,
    frequency_hz: 50.01,
    input_current_limit_a: 16,
  },
  generator: null,
  inverter_charger: {
    status: "warning",
    mode: "on",
    state: "bulk",
    ac_in_power_w: 1050,
    ac_out_power_w: 700,
    charge_current_a: 12,
    dc_power_w: 317,
    alarms: [{ name: "High temperature", level: "warning" }],
  },
  battery: {
    status: "good",
    soc_percent: 64.5,
    voltage_v: 26.4,
    current_a: 18.2,
    power_w: 480,
    temperature_c: null,
    time_to_go_s: null,
    activity: "charging",
    max_charge_voltage_v: 28.4,
    max_charge_current_a: 100,
    max_discharge_current_a: 150,
    min_cell_voltage_v: 3.29,
    max_cell_voltage_v: 3.31,
  },
  solar: {
    status: "good",
    power_w: 310,
    yield_today_kwh: 1.42,
    chargers: [
      { status: "good", name: "East array", power_w: 310, state: "bulk", yield_today_kwh: 1.42 },
      { status: "offline", name: "West array", power_w: null, state: null, yield_today_kwh: null },
    ],
  },
  ac_loads: { status: "normal", power_w: 900, on_output_w: 700, on_input_w: 200 },
  dc_loads: { status: "normal", power_w: null, measured_by: "calculation" },
  flows: [
    { source: "grid", target: "inverter_charger", power_w: 1050 },
    { source: "grid", target: "ac_loads", power_w: 200 },
    { source: "inverter_charger", target: "ac_loads", power_w: 700 },
    { source: "inverter_charger", target: "battery", power_w: 317 },
    { source: "solar", target: "battery", power_w: 310 },
  ],
};

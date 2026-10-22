// How every skin names the parts and words their states, so a reading means
// the same thing whichever skin shows it.
import type {
  Battery, Generator, Grid, InverterCharger, InverterMode, InverterState, PartName, Solar, System,
} from "../model/system";

export const MODES: Record<InverterMode, string> = {
  on: "On", off: "Off", charger_only: "Charger only", inverter_only: "Inverter only",
};

const INVERTER_STATES: Record<InverterState, string> = {
  off: "Off", low_power: "Low power", fault: "Fault", bulk: "Bulk", absorption: "Absorption", float: "Float",
  storage: "Storage", equalize: "Equalize", passthrough: "Passthrough", inverting: "Inverting",
  power_assist: "Power assist", power_supply: "Power supply", sustain: "Sustain",
  external_control: "External control", other: "Other",
};

export function partTitle(part: PartName, model: System): string {
  switch (part) {
    case "grid":
      return model.grid?.kind === "shore" ? "Shore power" : "Grid";
    case "generator":
      return "Generator";
    case "inverter_charger":
      return "Inverter";
    case "battery":
      return "Battery";
    case "solar":
      return "Solar";
    case "ac_loads":
      return "AC loads";
    case "dc_loads":
      return "DC loads";
  }
}

export function gridState(grid: Grid): string {
  return grid.connected === null ? "Unknown" : grid.connected ? "Connected" : "Disconnected";
}

export function generatorState(generator: Generator): string {
  return generator.running === null ? "Unknown" : generator.running ? "Running" : "Stopped";
}

export function inverterState(inverter: InverterCharger): string {
  return inverter.state === null ? "Unknown" : INVERTER_STATES[inverter.state];
}

export function batteryState(battery: Battery): string {
  return battery.activity === null
    ? "Unknown"
    : { idle: "Idle", charging: "Charging", discharging: "Discharging" }[battery.activity];
}

export function solarState(solar: Solar): string {
  return solar.power_w === null ? "Unknown" : solar.power_w > 0 ? "Producing" : "Not producing";
}

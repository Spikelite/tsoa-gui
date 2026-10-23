import type { TimeLeft } from "../model/system";

// How readings are written. A reading that is not known is shown as such,
// never as zero.
export const UNKNOWN = "unknown";

export type Format = (value: number) => string;

export const power: Format = (w) =>
  Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(Math.abs(w) >= 10000 ? 1 : 2)} kW` : `${Math.round(w)} W`;
export const volts: Format = (v) => `${v.toFixed(1)} V`;
export const cellVolts: Format = (v) => `${v.toFixed(3)} V`;
export const millivolts: Format = (v) => `${Math.round(v * 1000)} mV`;
export const amps: Format = (a) => `${a.toFixed(1)} A`;
export const hertz: Format = (f) => `${f.toFixed(2)} Hz`;
export const percent: Format = (p) => `${Math.round(p)}%`;
export const celsius: Format = (c) => `${c.toFixed(1)} °C`;
export const kilowattHours: Format = (e) => `${e.toFixed(2)} kWh`;

export const duration: Format = (seconds) => {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
};
/** Past this, a time left is too far off for a number to mean anything. */
const LONGEST_TIME_LEFT_S = 3 * 24 * 3600;

/**
 * The battery's time to empty or to full: rounded while its estimate is
 * fresh and still moving, so it does not look more certain than it is, and
 * to the minute once it has settled.
 */
export function timeLeft({ toward, seconds, settled }: TimeLeft): string {
  if (seconds > LONGEST_TIME_LEFT_S) {
    return "Over 3 days";
  }
  if (seconds < 30) {
    return toward === "empty" ? "At cut-off" : "Full";
  }
  if (settled) {
    return duration(seconds);
  }
  return seconds < 3600 ? `About ${Math.max(10, Math.round(seconds / 600) * 10)} min` : `About ${Math.round(seconds / 3600)} h`;
}

export const ampHours: Format = (ah) => `${ah.toFixed(1)} Ah`;
export const count: Format = (n) => `${Math.round(n)}`;
export const offsetMillivolts: Format = (v) => {
  const mv = Math.round(v * 1000);
  return `${mv >= 0 ? "+" : "-"}${Math.abs(mv)} mV`;
};
export const voltAmps: Format = (va) =>
  Math.abs(va) >= 1000 ? `${(va / 1000).toFixed(2)} kVA` : `${Math.round(va)} VA`;

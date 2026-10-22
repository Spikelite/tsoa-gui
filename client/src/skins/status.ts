import type { Status } from "../model/system";

// Every skin gives a status level the same meaning and color (the colors are
// --status-* in styles.css), and pairs it with this label and icon, so color
// is never the only signal.
export const STATUS_LABELS: Record<Status, string> = {
  good: "Good",
  normal: "Normal",
  attention: "Attention",
  warning: "Warning",
  fault: "Fault",
  offline: "Offline",
};

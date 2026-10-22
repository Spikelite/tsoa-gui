import type { Status } from "../../model/system";
import { STATUS_LABELS } from "../status";

// A status as the console shows one: a free-standing rounded button in the
// status's color, with the status in words on it, so the color is never the
// only signal.
export function StatusPill({ status }: { status: Status }) {
  return <span className={`fof-status status-${status}`}>{STATUS_LABELS[status]}</span>;
}

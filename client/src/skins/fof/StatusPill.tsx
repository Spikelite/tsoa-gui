import type { Status } from "../../model/system";
import { STATUS_LABELS } from "../status";

/** The statuses that need a viewer's attention, which say so in words as well as color. */
const ALARMING = new Set<Status>(["attention", "warning", "fault", "offline"]);

/**
 * A status in words, for inside something colored by that status. A status
 * that needs attention is written out, so color is never the only sign of a
 * problem; a good or normal one is left to the color on screen and read out
 * only to a screen reader.
 */
export function StatusWords({ status, separator = false }: { status: Status; separator?: boolean }) {
  const quiet = !ALARMING.has(status);
  // Written out after a name, the stylesheet puts a dot before it; read out
  // only, a comma keeps it from running into the name.
  return (
    <span className={quiet ? "fof-quiet" : "fof-status-words"}>
      {separator && quiet ? `, ${STATUS_LABELS[status]}` : STATUS_LABELS[status]}
    </span>
  );
}

// A name as the console labels one: a rounded button in the color of its
// status, with the status in words after the name when it needs attention.
export function NamePill({ name, status }: { name: string; status: Status }) {
  return (
    <span className={`fof-name-pill status-${status}`}>
      {name}
      <StatusWords status={status} separator />
    </span>
  );
}

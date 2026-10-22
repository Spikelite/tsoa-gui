import type { ReactNode } from "react";

import type { Status } from "../model/system";
import { STATUS_LABELS } from "./status";

// One shape per level, recognizable without color.
const ICONS: Record<Status, ReactNode> = {
  good: <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" />,
  normal: <circle cx="8" cy="8" r="5" fill="currentColor" />,
  attention: (
    <>
      <path d="M8 2l6.5 12h-13z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 6.5v3.5M8 11.5v1" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  warning: (
    <>
      <path d="M8 1.5l6.5 6.5-6.5 6.5-6.5-6.5z" fill="currentColor" />
      <path d="M8 5v3.5M8 10.5v1" stroke="var(--background)" strokeWidth="1.6" />
    </>
  ),
  fault: (
    <>
      <path d="M5.5 1.5h5l4 4v5l-4 4h-5l-4-4v-5z" fill="currentColor" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--background)" strokeWidth="1.6" />
    </>
  ),
  offline: <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.5 2" />,
};

export function StatusIcon({ status }: { status: Status }) {
  return (
    <svg className={`status-icon status-${status}`} viewBox="0 0 16 16" width="16" height="16" role="img"
      aria-label={STATUS_LABELS[status]}>
      {ICONS[status]}
    </svg>
  );
}

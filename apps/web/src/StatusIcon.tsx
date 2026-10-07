import type { ColumnStatus } from '@scrawlnotes/core';
import type { ReactNode } from 'react';

// A column's status as an icon, after the Issues views of design/mockups.html: waiting dashed,
// not started empty, started half full, in review three quarters, done ticked, dropped crossed.

const SHAPES: Record<ColumnStatus, ReactNode> = {
  backlog: <circle cx="12" cy="12" r="8" strokeDasharray="3.6 2.7" />,
  todo: <circle cx="12" cy="12" r="8" />,
  started: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12V7a5 5 0 0 1 0 10z" fill="currentColor" stroke="none" />
    </>
  ),
  review: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12V7a5 5 0 1 1-5 5z" fill="currentColor" stroke="none" />
    </>
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="8.6" fill="currentColor" stroke="none" />
      <path className="mark" d="M8.4 12.3l2.4 2.4 4.8-5" />
    </>
  ),
  dropped: (
    <>
      <circle cx="12" cy="12" r="8.6" fill="currentColor" stroke="none" />
      <path className="mark" d="M9.4 9.4l5.2 5.2M14.6 9.4l-5.2 5.2" />
    </>
  ),
};

export function StatusIcon({ status }: { status: ColumnStatus }) {
  return (
    <svg className={`sti ${status}`} viewBox="0 0 24 24" aria-hidden="true">
      {SHAPES[status]}
    </svg>
  );
}

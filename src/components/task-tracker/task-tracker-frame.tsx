'use client';

import { useLocale } from 'next-intl';

/** The owner's Task Tracker (src/tracker/tracker.html), embedded 1:1. It
 * fills the viewport and scrolls inside, like a Core section. */
export function TaskTrackerFrame({ title }: { title: string }) {
  const locale = useLocale();
  return (
    <iframe
      title={title}
      src={`/staff/api/task-tracker/app?l=${locale}`}
      className="w-full rounded-2xl border border-[var(--au-line)] bg-[var(--au-card)]"
      style={{ height: 'calc(100dvh - var(--app-chrome) - 3rem)', minHeight: 560 }}
    />
  );
}

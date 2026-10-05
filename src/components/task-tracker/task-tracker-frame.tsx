'use client';

import { ArrowLeft } from 'lucide-react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';

/** The owner's Task Tracker (src/tracker/tracker.html), embedded 1:1 and
 * opened full screen — no sidebar or header, like leaving for another site
 * (owner, 2026-10-05). A small pill leads back to the dashboard. */
export function TaskTrackerFrame({ title }: { title: string }) {
  const locale = useLocale();
  return (
    <div className="fixed inset-0 bg-au-bg">
      <iframe title={title} src={`/staff/api/task-tracker/app?l=${locale}`} className="block size-full border-0" />
      <Link
        href="/dashboard"
        aria-label="Persons ga qaytish"
        className="fixed bottom-4 left-4 z-10 inline-flex h-9 items-center gap-1.5 rounded-full border border-au-line bg-au-card px-3 text-[13px] font-semibold text-au-muted shadow-au-card transition-colors hover:text-au-ink"
      >
        <ArrowLeft className="size-4" /> Persons
      </Link>
    </div>
  );
}

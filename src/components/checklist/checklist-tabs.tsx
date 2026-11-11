'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export type ChecklistTab = 'mine' | 'team' | 'manage' | 'progress';

const LABELS: Record<ChecklistTab, string> = {
  mine: 'Mening checklistim',
  team: 'Jamoa statistikasi',
  manage: 'Boshqarish',
  progress: 'Progress',
};

/** Checklist page sections as tabs (like Operation HQ), so nothing sinks to
 * the bottom of a long page. The tab lives in the URL (?tab=) so a refresh or
 * a role switch keeps it, and switching never scrolls the page to the top. */
export function ChecklistTabs({
  value,
  tabs,
  panels,
}: {
  value: ChecklistTab;
  tabs: ChecklistTab[];
  panels: Partial<Record<ChecklistTab, ReactNode>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // The tab the user just clicked, shown as selected while the server renders it.
  const [pendingTab, setPendingTab] = useState<ChecklistTab | null>(null);
  const [pending, start] = useTransition();
  const shown = pending && pendingTab ? pendingTab : value;

  const go = (t: ChecklistTab) => {
    if (t === shown) return;
    setPendingTab(t);
    start(() => router.replace(t === 'mine' ? pathname : `${pathname}?tab=${t}`, { scroll: false }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div role="tablist" aria-label="Checklist bo‘limlari" className="flex gap-1.5 overflow-x-auto border-b border-au-line pb-2">
        {tabs.map((t) => {
          const on = t === shown;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go(t)}
              className={cn(
                'inline-flex shrink-0 items-center rounded-au-ctl border px-3.5 py-2 text-sm font-semibold transition-colors',
                on
                  ? 'border-au-line bg-au-card text-au-ink shadow-sm'
                  : 'border-transparent text-au-muted hover:bg-au-card-2 hover:text-au-ink',
              )}
            >
              {LABELS[t]}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" key={value} aria-busy={pending} className={cn('min-w-0 transition-opacity', pending && 'opacity-50')}>
        {panels[value]}
      </div>
    </div>
  );
}

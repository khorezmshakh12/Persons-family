'use client';

import { useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { deletePerformanceEntryAction } from '@/lib/actions/performance';
import { formatUZS } from '@/lib/format-currency';
import { cn } from '@/lib/utils';

export type PerformanceEntry = {
  id: string;
  entry_type: 'bonus' | 'penalty';
  amount: number;
  reason: string | null;
  created_at: string;
  /** Present when a penalty was filed as the follow-up to a warning — see
   * assignPunishmentAction. Undefined/omitted for plain entries. */
  warningReason?: string | null;
};

export function PerformanceEntriesList({
  entries,
  isAdmin,
}: {
  entries: PerformanceEntry[];
  isAdmin: boolean;
}) {
  const t = useTranslations('performance');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();

  if (entries.length === 0) {
    return <p className="text-sm text-white/60">{t('noEntries')}</p>;
  }

  function handleDelete(entryId: string) {
    const formData = new FormData();
    formData.set('entryId', entryId);
    startTransition(async () => {
      const result = await deletePerformanceEntryAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
          className="animate-fade-in-up flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
        >
          <div className="flex min-w-0 flex-col">
            <span
              className={cn(
                'font-semibold',
                entry.entry_type === 'bonus' ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {entry.entry_type === 'bonus' ? '+' : '-'}
              {formatUZS(entry.amount)}
            </span>
            {entry.reason && <span className="truncate text-xs text-white/60">{entry.reason}</span>}
            {entry.warningReason && (
              <span className="truncate text-xs text-amber-200/80">
                {t('fromWarning')}: {entry.warningReason}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-white/50">
              {format.dateTime(new Date(entry.created_at), { dateStyle: 'medium' })}
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleDelete(entry.id)}
                disabled={isPending}
                aria-label={t('delete')}
                className="text-white/50 hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

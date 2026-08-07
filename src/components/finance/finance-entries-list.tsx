'use client';

import { useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { deleteFinanceEntryAction } from '@/lib/actions/finance';
import { formatUZS } from '@/lib/format-currency';
import { cn } from '@/lib/utils';

export type FinanceEntry = {
  id: string;
  title: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export function FinanceEntriesList({ entries, isAdmin }: { entries: FinanceEntry[]; isAdmin: boolean }) {
  const t = useTranslations('finance');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();

  if (entries.length === 0) {
    return <p className="text-sm text-white/60">{t('noEntries')}</p>;
  }

  function handleDelete(entryId: string) {
    const formData = new FormData();
    formData.set('entryId', entryId);
    startTransition(async () => {
      const result = await deleteFinanceEntryAction(undefined, formData);
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
            <span className="font-medium text-white">{entry.title}</span>
            {entry.note && <span className="truncate text-xs text-white/60">{entry.note}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={cn('font-semibold tabular-nums', entry.amount >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {entry.amount >= 0 ? '+' : ''}
              {formatUZS(entry.amount)}
            </span>
            <span className="text-xs text-white/50">
              {format.dateTime(new Date(entry.created_at), { dateStyle: 'medium' })}
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleDelete(entry.id)}
                disabled={isPending}
                aria-label={t('delete')}
                className="tap-scale text-white/50 hover:text-red-400 disabled:opacity-50"
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

'use client';

import { useState, useTransition, useActionState, useEffect } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Trash2, Pencil } from 'lucide-react';
import { deleteFinanceEntryAction, updateFinanceEntryAction, type FinanceActionState } from '@/lib/actions/finance';
import { formatUZS } from '@/lib/format-currency';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/ui/money-input';

export type FinanceEntry = {
  id: string;
  title: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export function FinanceEntriesList({ entries, isAdmin }: { entries: FinanceEntry[]; isAdmin: boolean }) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number | null>(null);
  const [editState, editFormAction, editIsPending] = useActionState<FinanceActionState, FormData>(
    updateFinanceEntryAction,
    undefined,
  );

  useEffect(() => {
    if (editState && !editState.error) {
      toast.success(t('entryUpdated'));
      setEditOpen(null);
      setEditAmount(null);
    } else if (editState?.error) {
      toast.error(t(`errors.${editState.error}`));
    }
  }, [editState, t]);

  if (entries.length === 0) {
    return <p className="text-sm text-au-muted">{t('noEntries')}</p>;
  }

  function handleDelete(entryId: string) {
    // A ledger row is money — never delete it on a single stray click.
    const entry = entries.find((e) => e.id === entryId);
    if (!window.confirm(`«${entry?.title ?? ''}» yozuvi o‘chirilsinmi? (${formatUZS(entry?.amount ?? 0)} so‘m)`)) return;
    const formData = new FormData();
    formData.set('entryId', entryId);
    startTransition(async () => {
      const result = await deleteFinanceEntryAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  const currentEntry = editOpen ? entries.find((e) => e.id === editOpen) : null;

  return (
    <>
      <div className="flex flex-col gap-2">
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
            className="animate-fade-in-up flex items-center justify-between gap-3 rounded-xl border border-au-line bg-au-card-2 px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-medium text-au-ink">{entry.title}</span>
              {entry.note && <span className="truncate text-xs text-au-muted">{entry.note}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={cn('font-semibold tabular-nums', entry.amount >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {entry.amount >= 0 ? '+' : ''}
                {formatUZS(entry.amount)}
              </span>
              <span className="text-xs text-au-muted">
                {format.dateTime(new Date(entry.created_at), { dateStyle: 'medium' })}
              </span>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpen(entry.id);
                      setEditAmount(entry.amount);
                    }}
                    aria-label={t('edit')}
                    className="tap-scale text-au-muted hover:text-au-ink disabled:opacity-50"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    disabled={isPending}
                    aria-label={t('delete')}
                    className="tap-scale text-au-muted hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {currentEntry && (
        <Dialog open={editOpen !== null} onOpenChange={(open) => !open && setEditOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('editEntry')}</DialogTitle>
            </DialogHeader>
            <form action={editFormAction} className="flex flex-col gap-4">
              <input type="hidden" name="entryId" value={editOpen || ''} />
              <div className="flex flex-col gap-2">
                <Label htmlFor={`edit-title-${editOpen}`}>{t('entryTitle')}</Label>
                <Input
                  id={`edit-title-${editOpen}`}
                  name="title"
                  defaultValue={currentEntry.title}
                  placeholder={t('entryTitlePlaceholder')}
                  required
                />
                {editState?.fieldErrors?.title && (
                  <p className="text-destructive text-xs">{t(`errors.${editState.fieldErrors.title}`)}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`edit-amount-${editOpen}`}>{t('amount')}</Label>
                <MoneyInput
                  id={`edit-amount-${editOpen}`}
                  name="amount"
                  value={editAmount}
                  onValue={setEditAmount}
                  placeholder="0"
                />
                {editState?.fieldErrors?.amount && (
                  <p className="text-destructive text-xs">{t(`errors.${editState.fieldErrors.amount}`)}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`edit-note-${editOpen}`}>{t('note')}</Label>
                <Textarea
                  id={`edit-note-${editOpen}`}
                  name="note"
                  defaultValue={currentEntry.note || ''}
                  placeholder={t('notePlaceholder')}
                />
              </div>
              {editState?.error && <p className="text-destructive text-sm">{t(`errors.${editState.error}`)}</p>}
              <DialogFooter>
                <Button type="submit" loading={editIsPending} size="sm">
                  {editIsPending ? tCommon('loading') : 'Tahrirlash'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

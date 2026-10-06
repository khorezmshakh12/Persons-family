'use client';

import { useState, useTransition, useActionState, useEffect } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Trash2, Pencil } from 'lucide-react';
import { deletePerformanceEntryAction, updatePerformanceEntryAction, type PerformanceActionState } from '@/lib/actions/performance';
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
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/ui/money-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number | null>(null);
  const [editState, editFormAction, editIsPending] = useActionState<PerformanceActionState, FormData>(
    updatePerformanceEntryAction,
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
    const formData = new FormData();
    formData.set('entryId', entryId);
    startTransition(async () => {
      const result = await deletePerformanceEntryAction(undefined, formData);
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
              <span
                className={cn(
                  'font-semibold',
                  entry.entry_type === 'bonus' ? 'text-emerald-600' : 'text-red-600',
                )}
              >
                {entry.entry_type === 'bonus' ? '+' : '-'}
                {formatUZS(entry.amount)}
              </span>
              {entry.reason && <span className="truncate text-xs text-au-muted">{entry.reason}</span>}
              {entry.warningReason && (
                <span className="truncate text-xs text-amber-700">
                  {t('fromWarning')}: {entry.warningReason}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-au-muted">
                {format.dateTime(new Date(entry.created_at), { dateStyle: 'medium' })}
              </span>
              {isAdmin && !entry.warningReason && (
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
                <Label htmlFor={`edit-type-${editOpen}`}>{t('entryType')}</Label>
                <Select name="entryType" defaultValue={currentEntry.entry_type}>
                  <SelectTrigger id={`edit-type-${editOpen}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bonus">{t('bonus')}</SelectItem>
                    <SelectItem value="penalty">{t('penalty')}</SelectItem>
                  </SelectContent>
                </Select>
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
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`edit-reason-${editOpen}`}>{t('reason')}</Label>
                <Textarea
                  id={`edit-reason-${editOpen}`}
                  name="reason"
                  defaultValue={currentEntry.reason || ''}
                  maxLength={500}
                  rows={3}
                />
              </div>
              {editState?.error && <p className="text-destructive text-sm">{t(`errors.${editState.error}`)}</p>}
              <DialogFooter>
                <Button type="submit" disabled={editIsPending}>
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

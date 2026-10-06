'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { addFinanceEntryAction, type FinanceActionState } from '@/lib/actions/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/ui/money-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function ManageStaffFinanceDialog({ staffId }: { staffId: string }) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [sign, setSign] = useState<'+' | '-'>('+');
  const [state, formAction, isPending] = useActionState<FinanceActionState, FormData>(
    addFinanceEntryAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    } else if (state && !state.error) {
      toast.success(t('entryAdded'));
      setAmount(null);
      setSign('+');
      setOpen(false);
    }
  }, [state, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-fit border-au-line bg-au-card text-au-ink hover:bg-au-card-2"
          />
        }
      >
        <Plus className="size-4" />
        {t('addEntry')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addEntry')}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`title-${staffId}`}>{t('entryTitle')}</Label>
            <Input id={`title-${staffId}`} name="title" placeholder={t('entryTitlePlaceholder')} required />
            {state?.fieldErrors?.title && (
              <p className="text-destructive text-xs">{t(`errors.${state.fieldErrors.title}`)}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`amount-${staffId}`}>{t('amount')}</Label>
            {/* MoneyInput only takes digits; the sign is its own control so a
                deduction can still be entered (owner, 2026-10-06). */}
            <div className="flex gap-2">
              <select
                aria-label="Qo‘shish yoki ayirish"
                value={sign}
                onChange={(e) => setSign(e.target.value === '-' ? '-' : '+')}
                className="h-8 rounded-lg border border-au-line bg-au-card px-2 text-sm text-au-ink"
              >
                <option value="+">+ qo‘shish</option>
                <option value="-">− ayirish</option>
              </select>
              <MoneyInput id={`amount-${staffId}`} value={amount} onValue={setAmount} placeholder="0" />
            </div>
            <input type="hidden" name="amount" value={amount ? (sign === '-' ? -amount : amount) : ''} />
            {state?.fieldErrors?.amount && (
              <p className="text-destructive text-xs">{t(`errors.${state.fieldErrors.amount}`)}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`note-${staffId}`}>{t('note')}</Label>
            <Textarea id={`note-${staffId}`} name="note" placeholder={t('notePlaceholder')} />
          </div>
          <DialogFooter>
            <Button type="submit" loading={isPending} size="sm">
              {isPending ? tCommon('loading') : t('addEntry')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

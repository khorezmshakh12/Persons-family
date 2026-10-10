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

/** What the row is — decides its sign and whether it is earnings or a
 * payment. Mirrors the pay-run console's entry form. */
const ENTRY_TYPES = [
  { v: 'bonus', kind: 'adjustment', sign: 1, label: '+ Bonus / qo‘shimcha' },
  { v: 'deduct', kind: 'adjustment', sign: -1, label: '− Ushlanma / tuzatish' },
  { v: 'penalty', kind: 'penalty', sign: -1, label: '− Jarima' },
  { v: 'salary', kind: 'salary', sign: 1, label: 'Oylik to‘lovi (berildi)' },
  { v: 'advance', kind: 'advance', sign: 1, label: 'Avans to‘lovi (berildi)' },
] as const;
type EntryType = (typeof ENTRY_TYPES)[number]['v'];

export function ManageStaffFinanceDialog({ staffId, month }: { staffId: string; month: string }) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [type, setType] = useState<EntryType>('bonus');
  const entryType = ENTRY_TYPES.find((x) => x.v === type) ?? ENTRY_TYPES[0];
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
      setType('bonus');
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
            className="border-au-line bg-au-card text-au-ink hover:bg-au-card-2 w-fit"
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
            <Input
              id={`title-${staffId}`}
              name="title"
              placeholder={t('entryTitlePlaceholder')}
              required
            />
            {state?.fieldErrors?.title && (
              <p className="text-destructive text-xs">{t(`errors.${state.fieldErrors.title}`)}</p>
            )}
          </div>
          {/* Every row belongs to the payroll month on screen, so it reaches
              the pay run and respects the month lock. */}
          <input type="hidden" name="period" value={`${month}-01`} />
          <input type="hidden" name="kind" value={entryType.kind} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`type-${staffId}`}>Turi</Label>
            <select
              id={`type-${staffId}`}
              value={type}
              onChange={(e) => setType(e.target.value as EntryType)}
              className="border-au-line bg-au-card text-au-ink h-8 rounded-lg border px-2 text-sm"
            >
              {ENTRY_TYPES.map((x) => (
                <option key={x.v} value={x.v}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`amount-${staffId}`}>{t('amount')}</Label>
            <MoneyInput
              id={`amount-${staffId}`}
              value={amount}
              onValue={setAmount}
              placeholder="0"
            />
            <input type="hidden" name="amount" value={amount ? entryType.sign * amount : ''} />
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

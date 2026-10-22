'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CircleDollarSign } from 'lucide-react';
import { addPerformanceEntryAction, type PerformanceActionState } from '@/lib/actions/performance';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** CEO-only. A focused extraction of ManageStaffPerformanceDialog's entry
 * form (same addPerformanceEntryAction) without its Tier section, which
 * belongs to /self-development, not this page. */
const MONTHS_UZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const shiftYm = (ym: string, d: number) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/** `month` (YYYY-MM): the payroll month shown on the page — the default for
 * which month's pay the bonus / jarima belongs to. */
export function AddPerformanceEntryDialog({ staffId, month }: { staffId: string; month?: string }) {
  const t = useTranslations('performance');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [state, formAction, isPending] = useActionState<PerformanceActionState, FormData>(
    addPerformanceEntryAction,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if (state.error) toast.error(t(`errors.${state.error}`));
    else {
      toast.success(t('entryAdded'));
      setAmount(null);
      setOpen(false);
    }
  }, [state, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-au-line bg-au-card text-au-ink hover:bg-au-card-2"
          />
        }
      >
        <CircleDollarSign className="size-4" />
        {t('addEntry')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addEntry')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="entryType">{t('entryType')}</Label>
              <Select name="entryType" defaultValue="bonus">
                <SelectTrigger id="entryType" className="w-full">
                  <SelectValue>
                    {(value: string) => t(value === 'bonus' ? 'bonus' : 'penalty')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonus">{t('bonus')}</SelectItem>
                  <SelectItem value="penalty">{t('penalty')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">{t('amount')}</Label>
              <MoneyInput
                id="amount"
                name="amount"
                value={amount}
                onValue={setAmount}
                placeholder="0"
              />
            </div>
          </div>
          {month && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="period">Qaysi oy oyligiga</Label>
              <select id="period" name="period" defaultValue={month} className="h-9 rounded-md border border-au-line bg-au-card px-3 text-sm text-au-ink">
                {[-2, -1, 0, 1].map((d) => {
                  const ym = shiftYm(month, d);
                  return (
                    <option key={ym} value={ym}>
                      {MONTHS_UZ[Number(ym.slice(5, 7)) - 1]} {ym.slice(0, 4)}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">{t('reason')}</Label>
            <Textarea id="reason" name="reason" required minLength={3} maxLength={500} placeholder={t('reasonPlaceholder')} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? tCommon('loading') : t('addEntry')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useActionState, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { PlusCircle, Pencil } from 'lucide-react';
import {
  recordMonthActualAction,
  type IncomeRoadmapActionState,
} from '@/lib/actions/income-roadmap';
import type { IncomeRoadmapMonth } from './data';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CurrencyInput } from '@/components/staff/currency-input';

export function RecordActualDialog({
  staffId,
  roadmapId,
  month,
  trigger,
}: {
  staffId: string;
  roadmapId: string;
  month: IncomeRoadmapMonth;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations('incomeRoadmap');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [open, setOpen] = useState(false);

  const date = new Date(`${month.monthKey}-01T00:00:00Z`);
  const monthName = format.dateTime(date, { month: 'long' });

  const [state, formAction, isPending] = useActionState<IncomeRoadmapActionState, FormData>(
    async (prev, formData) => {
      const result = await recordMonthActualAction(prev, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        toast.success(t('actualRecorded'));
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  const isRecorded = month.actual !== null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : isRecorded ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('recordActual')}
              className="text-au-muted hover:text-au-ink hover:bg-au-card-2"
            >
              <Pencil className="size-3" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="gap-1 border-au-line bg-au-card-2 text-xs text-au-ink hover:bg-au-card-2"
            >
              <PlusCircle className="size-3 text-emerald-700" />
              {t('recordActual')}
            </Button>
          )
        }
      />
      <DialogContent className="border-au-line bg-au-card text-au-ink sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-au-ink">
            {t('recordActual')} · {monthName}
          </DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="roadmapId" value={roadmapId} />
          <input type="hidden" name="monthNumber" value={month.monthNumber} />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`actual-income-${month.monthNumber}`}>{t('actual')}</Label>
            <CurrencyInput
              id={`actual-income-${month.monthNumber}`}
              name="actualIncome"
              defaultValue={month.actual ?? month.planned}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`actual-note-${month.monthNumber}`}>{t('monthNote')}</Label>
            <Textarea
              id={`actual-note-${month.monthNumber}`}
              name="note"
              defaultValue={month.note ?? ''}
              maxLength={2000}
              rows={3}
              placeholder={t('monthNote')}
              className="border-au-line bg-au-card text-au-ink placeholder:text-au-faint"
            />
          </div>

          {state?.error && (
            <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-au-line text-au-ink hover:bg-au-card-2"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-au-primary hover:bg-black text-white font-medium"
            >
              {isPending ? tCommon('loading') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

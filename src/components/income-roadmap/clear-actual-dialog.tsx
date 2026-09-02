'use client';

import { useActionState, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import {
  clearMonthActualAction,
  type IncomeRoadmapActionState,
} from '@/lib/actions/income-roadmap';
import type { IncomeRoadmapMonth } from './data';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function ClearActualDialog({
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
      const result = await clearMonthActualAction(prev, formData);
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

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('clearActual')}
              className="text-red-300 hover:text-red-200 hover:bg-red-500/10"
            >
              <RotateCcw className="size-3" />
            </Button>
          )
        }
      />
      <AlertDialogContent className="border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            {t('confirmClearActualTitle')} ({monthName})
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/70">
            {t('confirmClearActualDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state?.error && (
          <p className="text-destructive text-sm px-4">{t(`errors.${state.error}`)}</p>
        )}

        <form action={formAction}>
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="roadmapId" value={roadmapId} />
          <input type="hidden" name="monthNumber" value={month.monthNumber} />

          <AlertDialogFooter className="border-t-0 bg-transparent p-0 gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              {tCommon('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              disabled={isPending}
              variant="destructive"
              className="bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              {isPending ? tCommon('loading') : t('clearActual')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

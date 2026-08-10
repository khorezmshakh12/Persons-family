'use client';

import { useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Trash2, Check } from 'lucide-react';
import { markStepAchievedAction, deleteIncomeStepAction } from '@/lib/actions/income-roadmap';
import { formatUZS } from '@/lib/format-currency';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type IncomeStep = {
  id: string;
  target_amount: number;
  target_month: string;
  benefit_description: string;
  status: string;
};

export function RoadmapStepCard({
  staffId,
  step,
  canManage,
}: {
  staffId: string;
  step: IncomeStep;
  canManage: boolean;
}) {
  const t = useTranslations('incomeRoadmap');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const achieved = step.status === 'achieved';

  function handleMarkAchieved() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('stepId', step.id);
      formData.set('staffId', staffId);
      const result = await markStepAchievedAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('stepId', step.id);
      formData.set('staffId', staffId);
      const result = await deleteIncomeStepAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-4',
        achieved ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-white/15 bg-white/5',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums text-white">{formatUZS(step.target_amount)}</span>
          <span className="text-xs text-white/60">
            {format.dateTime(new Date(step.target_month), { month: 'long', year: 'numeric' })}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              achieved ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60',
            )}
          >
            {achieved ? t('achieved') : t('pending')}
          </span>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {!achieved && (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('markAchieved')}
                disabled={isPending}
                onClick={handleMarkAchieved}
                className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
              >
                <Check className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('deleteStep')}
              disabled={isPending}
              onClick={handleDelete}
              className="border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      <p className="text-sm text-white/70">{step.benefit_description}</p>
    </div>
  );
}

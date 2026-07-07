'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { updateGoalAction, deleteGoalAction, type RoadmapActionState } from '@/lib/actions/roadmap';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type Goal = {
  id: string;
  title: string;
  timeframe: 'weekly' | 'monthly' | 'quarterly';
  status: 'pending' | 'done' | 'failed';
  progress_percentage: number;
  failure_reason: string | null;
  solution: string | null;
};

const STATUS_TINT: Record<Goal['status'], string> = {
  pending: 'border-white/30 bg-white/10 text-white hover:bg-white/20',
  done: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25',
  failed: 'border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/25',
};

export function GoalCard({ goal }: { goal: Goal }) {
  const t = useTranslations('roadmap');
  const [progress, setProgress] = useState(goal.progress_percentage);
  const [isPending, startTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();

  function handleStatusChange(value: string | null) {
    if (!value || value === goal.status) return;
    const formData = new FormData();
    formData.set('id', goal.id);
    formData.set('status', value);
    startTransition(async () => {
      const result = await updateGoalAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  function handleProgressCommit(value: number) {
    const formData = new FormData();
    formData.set('id', goal.id);
    formData.set('progressPercentage', String(value));
    startTransition(async () => {
      const result = await updateGoalAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  function handleDelete() {
    const formData = new FormData();
    formData.set('id', goal.id);
    startDeleteTransition(() => {
      deleteGoalAction(formData);
    });
  }

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-3 p-5')}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-white">{goal.title}</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeletePending}
          aria-label={t('delete')}
          className="shrink-0 text-white/40 hover:text-red-300"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <Select value={goal.status} onValueChange={handleStatusChange} disabled={isPending}>
        <SelectTrigger className={cn('w-full', STATUS_TINT[goal.status])}>
          <SelectValue>{(value: string) => t(`status.${value}`)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">{t('status.pending')}</SelectItem>
          <SelectItem value="done">{t('status.done')}</SelectItem>
          <SelectItem value="failed">{t('status.failed')}</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-white/70">
          <span>{t('progress')}</span>
          <span className="tabular-nums">{progress}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          onMouseUp={() => handleProgressCommit(progress)}
          onTouchEnd={() => handleProgressCommit(progress)}
          disabled={isPending}
          aria-label={t('progress')}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-teal-400"
        />
      </div>

      {goal.status === 'failed' && (
        <FailureDetailsForm goalId={goal.id} failureReason={goal.failure_reason} solution={goal.solution} />
      )}
    </div>
  );
}

function FailureDetailsForm({
  goalId,
  failureReason,
  solution,
}: {
  goalId: string;
  failureReason: string | null;
  solution: string | null;
}) {
  const t = useTranslations('roadmap');
  const [state, formAction, isPending] = useActionState<RoadmapActionState, FormData>(updateGoalAction, undefined);

  useEffect(() => {
    if (state?.success) toast.success(t('detailsSaved'));
    else if (state?.error) toast.error(t(`errors.${state.error}`));
  }, [state, t]);

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-white/10 pt-3">
      <input type="hidden" name="id" value={goalId} />
      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/60">{t('failureReason')}</label>
        <Textarea
          name="failureReason"
          defaultValue={failureReason ?? ''}
          rows={2}
          maxLength={2000}
          placeholder={t('failureReasonPlaceholder')}
          className="border-white/30 bg-white/10 text-sm text-white placeholder:text-white/40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/60">{t('solution')}</label>
        <Textarea
          name="solution"
          defaultValue={solution ?? ''}
          rows={2}
          maxLength={2000}
          placeholder={t('solutionPlaceholder')}
          className="border-white/30 bg-white/10 text-sm text-white placeholder:text-white/40"
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending} className="w-fit">
        {isPending ? t('saving') : t('saveDetails')}
      </Button>
    </form>
  );
}

'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { updateRoadmapGoalAction, deleteRoadmapGoalAction, type RoadmapActionState } from '@/lib/actions/roadmap';
import { Button } from '@/components/ui/button';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import type { Database } from '@/lib/supabase/types';

type RoadmapStatus = Database['public']['Enums']['roadmap_status'];

export type RoadmapGoal = {
  id: string;
  title: string;
  status: RoadmapStatus;
  progress_percentage: number;
  solution: string | null;
  failure_reason: string | null;
};

const FIELD =
  'w-full rounded-lg border border-white/25 bg-white/5 px-3 py-1.5 text-sm text-white outline-none transition-colors focus-visible:border-white/70';

export function GoalCard({ goal }: { goal: RoadmapGoal }) {
  const t = useTranslations('roadmap');
  const tCommon = useTranslations('common');
  const [state, formAction, isPending] = useActionState<RoadmapActionState, FormData>(
    updateRoadmapGoalAction,
    undefined,
  );
  const [isDeleting, startDelete] = useTransition();
  const [status, setStatus] = useState<RoadmapStatus>(goal.status);

  useEffect(() => {
    if (state?.error) toast.error(t(`errors.${state.error}`));
    else if (state && !state.error) toast.success(t('goalUpdated'));
  }, [state, t]);

  function handleDelete() {
    startDelete(async () => {
      const formData = new FormData();
      formData.set('goalId', goal.id);
      const result = await deleteRoadmapGoalAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
      <input type="hidden" name="goalId" value={goal.id} />
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-white">{goal.title}</span>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('deleteGoal')}
                className="border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
              />
            }
          >
            <Trash2 className="size-3.5" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('confirmDeleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('confirmDeleteDescription', { title: goal.title })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                disabled={isDeleting}
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? <Loader2 className="size-4 animate-spin" /> : t('confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Progress value={goal.progress_percentage}>
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/60">{t('status')}</label>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as RoadmapStatus)}
            className={FIELD}
          >
            <option value="pending">{t('statusLabels.pending')}</option>
            <option value="done">{t('statusLabels.done')}</option>
            <option value="failed">{t('statusLabels.failed')}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/60">{t('progress')}</label>
          <input
            type="number"
            name="progressPercentage"
            min={0}
            max={100}
            defaultValue={goal.progress_percentage}
            className={FIELD}
          />
        </div>
      </div>

      {status === 'done' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/60">{t('solution')}</label>
          <textarea
            name="solution"
            defaultValue={goal.solution ?? ''}
            placeholder={t('solutionPlaceholder')}
            rows={2}
            className={FIELD}
          />
        </div>
      )}
      {status === 'failed' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/60">{t('failureReason')}</label>
          <textarea
            name="failureReason"
            defaultValue={goal.failure_reason ?? ''}
            placeholder={t('failureReasonPlaceholder')}
            rows={2}
            className={FIELD}
          />
        </div>
      )}

      <Button type="submit" size="sm" loading={isPending} className="w-fit self-end">
        {t('save')}
      </Button>
    </form>
  );
}

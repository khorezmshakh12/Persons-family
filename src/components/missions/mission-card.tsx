'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import {
  startMissionAction,
  submitMissionAction,
  approveMissionAction,
  rejectMissionAction,
  deleteMissionAction,
  type MissionActionState,
} from '@/lib/actions/missions';
import { formatUZS } from '@/lib/format-currency';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CountdownTimer } from './countdown-timer';
import { cn } from '@/lib/utils';
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

export type MissionItem = {
  id: string;
  staff_id: string;
  title: string;
  description: string | null;
  deadline_date: string;
  bonus_amount: number | null;
  status: string;
  submission_note: string | null;
  rejection_note: string | null;
  created_at: string;
};

const STATUS_TINT = {
  pending: 'slate',
  in_progress: 'blue',
  submitted: 'amber',
  approved: 'green',
  rejected: 'red',
} as const;

export function MissionCard({
  mission,
  currentUserId,
  isCeo,
}: {
  mission: MissionItem;
  currentUserId: string;
  isCeo: boolean;
}) {
  const t = useTranslations('missions');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const isAssignee = mission.staff_id === currentUserId;
  const [isPending, startTransition] = useTransition();
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [note, setNote] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionNote, setRejectionNote] = useState('');
  const [submitState, submitFormAction, isSubmitPending] = useActionState<MissionActionState, FormData>(
    submitMissionAction,
    undefined,
  );

  useEffect(() => {
    if (submitState?.error) toast.error(t(`errors.${submitState.error}`));
    else if (submitState && !submitState.error) setShowSubmitForm(false);
  }, [submitState, t]);

  function runAction(
    action: (prev: MissionActionState, fd: FormData) => Promise<MissionActionState>,
    extra?: Record<string, string>,
    onSuccess?: () => void,
  ) {
    const formData = new FormData();
    formData.set('missionId', mission.id);
    formData.set('staffId', mission.staff_id);
    for (const [k, v] of Object.entries(extra ?? {})) formData.set(k, v);
    startTransition(async () => {
      const result = await action(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
      else onSuccess?.();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white">{mission.title}</span>
            <Badge variant="tint" tint={STATUS_TINT[mission.status as keyof typeof STATUS_TINT]} className="text-[10px]">
              {t(`statusLabels.${mission.status}`)}
            </Badge>
          </div>
          {mission.description && <span className="text-xs text-white/60">{mission.description}</span>}
          <span className="text-xs text-white/50">
            {t('deadline')}: {format.dateTime(new Date(`${mission.deadline_date}T00:00:00Z`), { dateStyle: 'medium' })}
          </span>
          {mission.bonus_amount != null && (
            <span className="text-xs font-semibold text-emerald-400">
              {t('bonusAmount')}: {formatUZS(mission.bonus_amount)}
            </span>
          )}
          {mission.status === 'submitted' && mission.submission_note && (
            <span className="text-xs text-white/70">
              {t('submissionNote')}: {mission.submission_note}
            </span>
          )}
          {mission.rejection_note && (
            <span className="text-xs text-red-300">
              {t('rejectionNote')}: {mission.rejection_note}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isCeo && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <button
                    type="button"
                    disabled={isPending}
                    aria-label={t('delete')}
                    className="tap-scale text-white/50 hover:text-red-400 disabled:opacity-50"
                  />
                }
              >
                <Trash2 className="size-4" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('confirmDeleteTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('confirmDeleteDescription')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    type="button"
                    disabled={isPending}
                    onClick={() => runAction(deleteMissionAction)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {t('confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {mission.status === 'in_progress' && <CountdownTimer deadlineDate={mission.deadline_date} />}

      {isAssignee && mission.status === 'pending' && (
        <Button type="button" size="sm" disabled={isPending} onClick={() => runAction(startMissionAction)} className="w-fit">
          {t('start')}
        </Button>
      )}

      {isAssignee && mission.status === 'in_progress' && (
        <>
          {!showSubmitForm ? (
            <Button type="button" size="sm" onClick={() => setShowSubmitForm(true)} className="w-fit">
              {t('submit')}
            </Button>
          ) : (
            <form action={submitFormAction} className="flex flex-col gap-2">
              <input type="hidden" name="missionId" value={mission.id} />
              <input type="hidden" name="staffId" value={mission.staff_id} />
              <Textarea
                name="submissionNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('submissionNotePlaceholder')}
                required
                rows={2}
              />
              <Button type="submit" size="sm" loading={isSubmitPending} className="w-fit">
                {t('submit')}
              </Button>
            </form>
          )}
        </>
      )}

      {isCeo && mission.status === 'submitted' && (
        <>
          {!showRejectForm ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => runAction(approveMissionAction)}
                className={cn('w-fit bg-emerald-600 hover:bg-emerald-700')}
              >
                {t('approve')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setShowRejectForm(true)}
                className="w-fit border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
              >
                {t('reject')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Textarea
                value={rejectionNote}
                onChange={(e) => setRejectionNote(e.target.value)}
                placeholder={t('rejectionNote')}
                rows={2}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    runAction(rejectMissionAction, { rejectionNote }, () => {
                      setShowRejectForm(false);
                      setRejectionNote('');
                    })
                  }
                  className="w-fit border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                >
                  {t('reject')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setShowRejectForm(false)}
                  className="w-fit"
                >
                  {tCommon('cancel')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

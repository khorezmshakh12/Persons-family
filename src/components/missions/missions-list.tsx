'use client';

import { useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Trash2, Check, Undo2 } from 'lucide-react';
import { toggleMissionCompleteAction, deleteMissionAction } from '@/lib/actions/missions';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type MissionItem = {
  id: string;
  staff_id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  created_at: string;
};

export function MissionsList({
  missions,
  currentUserId,
  isAdmin,
}: {
  missions: MissionItem[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const t = useTranslations('missions');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();

  if (missions.length === 0) {
    return <p className="text-sm text-white/60">{t('noMissions')}</p>;
  }

  function handleToggle(missionId: string, nextCompleted: boolean) {
    const formData = new FormData();
    formData.set('missionId', missionId);
    formData.set('isCompleted', String(nextCompleted));
    startTransition(async () => {
      const result = await toggleMissionCompleteAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  function handleDelete(missionId: string) {
    const formData = new FormData();
    formData.set('missionId', missionId);
    startTransition(async () => {
      const result = await deleteMissionAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {missions.map((mission, index) => {
        const canToggle = mission.staff_id === currentUserId;
        return (
          <div
            key={mission.id}
            style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
            className="animate-fade-in-up flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('font-medium text-white', mission.is_completed && 'line-through opacity-60')}>
                  {mission.title}
                </span>
                <Badge variant="tint" tint={mission.is_completed ? 'green' : 'slate'} className="text-[10px]">
                  {mission.is_completed ? t('completed') : t('active')}
                </Badge>
              </div>
              {mission.description && <span className="text-xs text-white/60">{mission.description}</span>}
              <span className="text-xs text-white/40">
                {format.dateTime(new Date(mission.created_at), { dateStyle: 'medium' })}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canToggle && (
                <button
                  type="button"
                  onClick={() => handleToggle(mission.id, !mission.is_completed)}
                  disabled={isPending}
                  aria-label={mission.is_completed ? t('markIncomplete') : t('markComplete')}
                  className={cn(
                    'tap-scale flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                    mission.is_completed
                      ? 'border-white/20 text-white/60 hover:bg-white/10'
                      : 'border-white/40 bg-white/15 text-white hover:bg-white/25',
                  )}
                >
                  {mission.is_completed ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
                  {mission.is_completed ? t('markIncomplete') : t('markComplete')}
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(mission.id)}
                  disabled={isPending}
                  aria-label={t('delete')}
                  className="tap-scale text-white/50 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

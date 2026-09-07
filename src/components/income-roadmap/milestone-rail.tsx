'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Flag, CheckCircle2, Clock, AlertCircle, Circle } from 'lucide-react';
import {
  setMilestoneStatusAction,
} from '@/lib/actions/income-roadmap';
import type { IncomeRoadmapMilestone, MilestoneStatus } from './data';
import { formatUZS } from '@/lib/format-currency';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UpsertMilestoneDialog } from './upsert-milestone-dialog';
import { DeleteMilestoneDialog } from './delete-milestone-dialog';
import { cn } from '@/lib/utils';

const STATUS_BADGES: Record<
  MilestoneStatus,
  { labelKey: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  planned: {
    labelKey: 'milestoneStatus.planned',
    className: 'bg-white/10 text-white/70 border-white/15',
    icon: Circle,
  },
  in_progress: {
    labelKey: 'milestoneStatus.in_progress',
    className: 'bg-sky-500/20 text-sky-200 border-sky-400/30',
    icon: Clock,
  },
  achieved: {
    labelKey: 'milestoneStatus.achieved',
    className: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
    icon: CheckCircle2,
  },
  missed: {
    labelKey: 'milestoneStatus.missed',
    className: 'bg-red-500/20 text-red-200 border-red-400/30',
    icon: AlertCircle,
  },
};

function MilestoneStatusSelector({
  staffId,
  milestone,
  disabled,
}: {
  staffId: string;
  milestone: IncomeRoadmapMilestone;
  disabled: boolean;
}) {
  const t = useTranslations('incomeRoadmap');
  const [isPending, startTransition] = useTransition();

  function handleStatusChange(newStatus: string | null) {
    if (!newStatus) return;
    const formData = new FormData();
    formData.set('staffId', staffId);
    formData.set('milestoneId', milestone.id);
    formData.set('status', newStatus);

    startTransition(async () => {
      const res = await setMilestoneStatusAction(undefined, formData);
      if (res?.error) {
        toast.error(t(`errors.${res.error}`));
      } else {
        toast.success(t('milestoneSaved'));
      }
    });
  }

  return (
    <Select
      value={milestone.status}
      onValueChange={handleStatusChange}
      disabled={disabled || isPending}
    >
      <SelectTrigger className="h-7 border-white/20 bg-white/5 text-xs text-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-white/20 bg-slate-900/95 text-white backdrop-blur-xl">
        <SelectItem value="planned">{t('milestoneStatus.planned')}</SelectItem>
        <SelectItem value="in_progress">{t('milestoneStatus.in_progress')}</SelectItem>
        <SelectItem value="achieved">{t('milestoneStatus.achieved')}</SelectItem>
        <SelectItem value="missed">{t('milestoneStatus.missed')}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function MilestoneRail({
  milestones,
  roadmapId,
  staffId,
  canManage,
}: {
  milestones: IncomeRoadmapMilestone[];
  roadmapId: string;
  staffId: string;
  canManage: boolean;
}) {
  const t = useTranslations('incomeRoadmap');

  // Sorted by targetMonth
  const sorted = [...milestones].sort((a, b) => a.targetMonth - b.targetMonth);

  // Find last achieved index to highlight connecting line in emerald
  const lastAchievedIndex = sorted.reduce((lastIdx, m, idx) => {
    return m.status === 'achieved' ? idx : lastIdx;
  }, -1);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/15 bg-white/5 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Flag className="size-4 text-emerald-300" />
          <h3 className="text-sm font-semibold text-white">{t('milestones')}</h3>
          <Badge variant="outline" className="border-white/20 bg-white/10 text-white/70 text-[10px]">
            {milestones.length}
          </Badge>
        </div>

        {canManage && (
          <UpsertMilestoneDialog staffId={staffId} roadmapId={roadmapId} />
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-white/50 text-xs">
          <p>{t('noMilestones')}</p>
        </div>
      ) : (
        <div className="relative flex flex-col gap-4 pl-2 sm:pl-4 py-2">
          {sorted.map((m, idx) => {
            const statusConfig = STATUS_BADGES[m.status] || STATUS_BADGES.planned;
            const StatusIcon = statusConfig.icon;
            const isLast = idx === sorted.length - 1;
            const isPassedOrAchieved = idx <= lastAchievedIndex;

            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
                className="relative flex items-start gap-3 group"
              >
                {/* Vertical timeline track & indicator */}
                <div className="flex flex-col items-center self-stretch">
                  <div
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full border shadow-sm z-10 transition-colors',
                      m.status === 'achieved'
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                        : m.status === 'in_progress'
                          ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                          : m.status === 'missed'
                            ? 'border-red-400 bg-red-500/20 text-red-200'
                            : 'border-white/25 bg-slate-900 text-white/60',
                    )}
                  >
                    <StatusIcon className="size-3" />
                  </div>

                  {!isLast && (
                    <div
                      className={cn(
                        'w-[1px] grow my-1',
                        isPassedOrAchieved ? 'bg-emerald-400/60' : 'bg-white/15',
                      )}
                    />
                  )}
                </div>

                {/* Milestone content card */}
                <div className="flex grow flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 p-3 text-xs backdrop-blur-sm transition-colors group-hover:bg-white/[0.08]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">
                        {t('month')} {m.targetMonth}
                      </span>
                      <span className="font-semibold text-white text-sm">
                        {m.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-300 tabular-nums">
                        {formatUZS(m.targetIncome)}
                      </span>

                      {canManage ? (
                        <div className="flex items-center gap-1">
                          <MilestoneStatusSelector
                            staffId={staffId}
                            milestone={m}
                            disabled={!canManage}
                          />
                          <UpsertMilestoneDialog
                            staffId={staffId}
                            roadmapId={roadmapId}
                            milestone={m}
                          />
                          <DeleteMilestoneDialog staffId={staffId} milestone={m} />
                        </div>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] border', statusConfig.className)}
                        >
                          {t(statusConfig.labelKey)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {m.criteria && (
                    <p className="text-white/65 text-[11px] leading-relaxed">
                      {m.criteria}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { Flag } from 'lucide-react';
import type { Goal } from './goal-card';
import { formatUZS } from '@/lib/format-currency';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type Milestone = {
  id: string;
  title: string;
  estimated_budget: number | null;
};

const STAGES: Goal['timeframe'][] = ['weekly', 'monthly', 'quarterly'];

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export async function MilestoneTimeline({ goals, milestones }: { goals: Goal[]; milestones: Milestone[] }) {
  const t = await getTranslations('roadmap');

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-6 p-6')}>
      <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {t('milestoneTimeline.title')}
      </h2>

      <div className="flex flex-col gap-0 sm:flex-row sm:items-stretch sm:gap-0">
        {STAGES.map((stage, index) => {
          const stageGoals = goals.filter((g) => g.timeframe === stage);
          const progress = average(stageGoals.map((g) => g.progress_percentage));
          return (
            <div key={stage} className="flex flex-1 items-stretch gap-0">
              <div className="flex flex-1 flex-col gap-2 rounded-xl border border-white/15 bg-white/5 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-400/20 text-xs font-bold text-teal-200">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-white">{t(`timeframe.${stage}`)}</span>
                </div>
                <span className="text-xs text-white/60">
                  {t('milestoneTimeline.goalsCount', { count: stageGoals.length })}
                </span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-400"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-right text-xs tabular-nums text-white/50">{progress}%</span>
              </div>
              {index < STAGES.length - 1 && (
                <div className="hidden w-6 shrink-0 items-center justify-center sm:flex">
                  <div className="h-px w-full bg-gradient-to-r from-white/30 to-white/10" />
                </div>
              )}
            </div>
          );
        })}

        <div className="hidden w-6 shrink-0 items-center justify-center sm:flex">
          <div className="h-px w-full bg-gradient-to-r from-white/10 to-teal-300/50" />
        </div>

        <div className="flex flex-1 flex-col gap-2 rounded-xl border border-teal-300/30 bg-teal-400/10 p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-400/30 text-teal-100">
              <Flag className="size-3.5" />
            </span>
            <span className="text-sm font-semibold text-white">{t('milestoneTimeline.milestonesLabel')}</span>
          </div>
          <span className="text-xs text-white/60">
            {t('milestoneTimeline.goalsCount', { count: milestones.length })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-white/80">{t('milestoneTimeline.destinationsTitle')}</h3>
        {milestones.length === 0 ? (
          <p className="text-sm text-white/60">{t('milestoneTimeline.noMilestones')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-4"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-400/20 text-teal-200">
                  <Flag className="size-4" />
                </span>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  <span className="truncate text-sm font-medium text-white">{milestone.title}</span>
                  <span className="text-xs text-teal-200">
                    {milestone.estimated_budget !== null
                      ? `${formatUZS(milestone.estimated_budget)} ${t('milestoneTimeline.currency')}`
                      : t('milestoneTimeline.noBudget')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

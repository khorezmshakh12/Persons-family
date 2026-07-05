import { getTranslations } from 'next-intl/server';
import { TierBadge, type StaffTier } from '@/components/staff/tier-badge';
import { Progress } from '@/components/ui/progress';

export async function WeeklyProgressCard({
  performance,
}: {
  performance: { current_tier: StaffTier; months_in_tier: number; weekly_progress_score: number } | null;
}) {
  const t = await getTranslations('dashboard');

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-medium">{t('weeklyProgress.title')}</h2>
      {performance ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">{t('weeklyProgress.currentTier')}</span>
            <TierBadge tier={performance.current_tier} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('weeklyProgress.score')}</span>
              <span className="font-medium tabular-nums">{performance.weekly_progress_score}%</span>
            </div>
            <Progress value={performance.weekly_progress_score} />
          </div>
          <p className="text-muted-foreground text-sm">
            {t('weeklyProgress.monthsInTier', { months: performance.months_in_tier })}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('weeklyProgress.noData')}</p>
      )}
    </div>
  );
}

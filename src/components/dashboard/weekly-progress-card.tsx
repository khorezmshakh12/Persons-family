import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { TierBadge } from '@/components/staff/tier-badge';
import { Progress } from '@/components/ui/progress';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export async function WeeklyProgressCard({ userId }: { userId: string | null }) {
  const t = await getTranslations('dashboard');
  const supabase = await createClient();

  const { data: performance } = userId
    ? await supabase
        .from('staff_performance')
        .select('current_tier, months_in_tier, weekly_progress_score')
        .eq('staff_id', userId)
        .maybeSingle()
    : { data: null };

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <h2 className="font-heading text-lg font-medium">{t('weeklyProgress.title')}</h2>
      {performance ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">{t('weeklyProgress.currentTier')}</span>
            <TierBadge tier={performance.current_tier} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">{t('weeklyProgress.score')}</span>
              <span className="font-medium tabular-nums">{performance.weekly_progress_score}%</span>
            </div>
            <Progress value={performance.weekly_progress_score} />
          </div>
          <p className="text-sm text-white/70">
            {t('weeklyProgress.monthsInTier', { months: performance.months_in_tier })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-white/70">{t('weeklyProgress.noData')}</p>
      )}
    </div>
  );
}

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { CreateGoalDialog } from '@/components/roadmap/create-goal-dialog';
import { GoalCard, type RoadmapGoal } from '@/components/roadmap/goal-card';

export const dynamic = 'force-dynamic';

type Timeframe = 'weekly' | 'monthly' | 'quarterly';
const TIMEFRAMES: Timeframe[] = ['weekly', 'monthly', 'quarterly'];

export default async function RoadmapPage() {
  const { profile } = await getAuthState();
  if (profile!.role !== 'ceo' && profile!.role !== 'admin_manager') notFound();

  const t = await getTranslations('roadmap');
  const data = await sql<(RoadmapGoal & { timeframe: Timeframe })[]>`
    select id, title, timeframe, status, progress_percentage, solution, failure_reason
    from roadmap_goals order by created_at desc
  `;

  const goalsByTimeframe = new Map<Timeframe, RoadmapGoal[]>();
  for (const g of data) {
    const list = goalsByTimeframe.get(g.timeframe) ?? [];
    list.push(g);
    goalsByTimeframe.set(g.timeframe, list);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <div className="flex flex-col gap-1 relative overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">
          {t('title')}
        </h1>
        <p className="text-au-muted">{t('subtitle')}</p>
      </div>

      {TIMEFRAMES.map((tf) => {
        const goals = goalsByTimeframe.get(tf) ?? [];
        return (
          <div key={tf} className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-au-ink">{t(`timeframes.${tf}`)}</h2>
              <CreateGoalDialog timeframe={tf} />
            </div>
            {goals.length === 0 ? (
              <p className="text-sm text-au-muted">{t('noGoals')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {goals.map((g, index) => (
                  <GoalCard key={g.id} goal={g} index={index} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

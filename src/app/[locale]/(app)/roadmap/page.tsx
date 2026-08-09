import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { CreateGoalDialog } from '@/components/roadmap/create-goal-dialog';
import { GoalCard, type RoadmapGoal } from '@/components/roadmap/goal-card';
import type { Database } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

type Timeframe = Database['public']['Enums']['roadmap_timeframe'];
const TIMEFRAMES: Timeframe[] = ['weekly', 'monthly', 'quarterly'];

export default async function RoadmapPage() {
  const { profile } = await getAuthState();
  if (profile!.role !== 'ceo' && profile!.role !== 'admin_manager') notFound();

  const t = await getTranslations('roadmap');
  const supabase = await createClient();
  const { data } = await supabase
    .from('roadmap_goals')
    .select('id, title, timeframe, status, progress_percentage, solution, failure_reason')
    .order('created_at', { ascending: false });

  const goalsByTimeframe = new Map<Timeframe, RoadmapGoal[]>();
  for (const g of data ?? []) {
    const list = goalsByTimeframe.get(g.timeframe) ?? [];
    list.push(g);
    goalsByTimeframe.set(g.timeframe, list);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="text-white/70">{t('subtitle')}</p>
      </div>

      {TIMEFRAMES.map((tf) => {
        const goals = goalsByTimeframe.get(tf) ?? [];
        return (
          <div key={tf} className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-white">{t(`timeframes.${tf}`)}</h2>
              <CreateGoalDialog timeframe={tf} />
            </div>
            {goals.length === 0 ? (
              <p className="text-sm text-white/60">{t('noGoals')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {goals.map((g) => (
                  <GoalCard key={g.id} goal={g} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

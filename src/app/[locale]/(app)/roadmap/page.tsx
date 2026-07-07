import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { RoadmapBoard } from '@/components/roadmap/roadmap-board';
import { CreateGoalDialog } from '@/components/roadmap/create-goal-dialog';
import { MilestoneTimeline, type Milestone } from '@/components/roadmap/milestone-timeline';
import type { Goal } from '@/components/roadmap/goal-card';

export const dynamic = 'force-dynamic';

export default async function RoadmapPage() {
  const t = await getTranslations('roadmap');
  const supabase = await createClient();

  const [{ data: goals }, { data: projects }] = await Promise.all([
    supabase
      .from('roadmap_goals')
      .select('id, title, timeframe, status, progress_percentage, failure_reason, solution')
      .order('created_at', { ascending: false }),
    supabase
      .from('future_projects')
      .select('id, title, estimated_budget')
      .order('created_at', { ascending: false }),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <CreateGoalDialog />
      </div>
      <MilestoneTimeline
        goals={(goals as unknown as Goal[]) ?? []}
        milestones={(projects as unknown as Milestone[]) ?? []}
      />
      <RoadmapBoard goals={(goals as unknown as Goal[]) ?? []} />
    </div>
  );
}

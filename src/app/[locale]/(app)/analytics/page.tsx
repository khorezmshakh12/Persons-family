import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { StaffPerformanceChart } from '@/components/analytics/staff-performance-chart';
import { RoadmapGoalsChart } from '@/components/analytics/roadmap-goals-chart';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const { profile } = await getAuthState();
  if (profile!.role !== 'ceo') notFound();

  const t = await getTranslations('analytics');

  const [performance, goals] = await Promise.all([
    sql<{ weekly_progress_score: number; first_name: string | null; last_name: string | null }[]>`
      select sp.weekly_progress_score, p.first_name, p.last_name
      from staff_performance sp
      left join profiles p on p.id = sp.staff_id
    `,
    sql<{ title: string; progress_percentage: number; status: 'pending' | 'done' | 'failed' }[]>`
      select title, progress_percentage, status from roadmap_goals
    `,
  ]);

  const staffPerformanceData = performance
    .filter((p) => p.first_name)
    .map((p) => ({
      name: `${p.first_name} ${p.last_name}`,
      score: p.weekly_progress_score,
    }));

  const roadmapGoalsData = goals.map((g) => ({
    name: g.title,
    progress: g.progress_percentage,
    status: g.status,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="rounded-3xl border border-white/20 bg-white/10 p-8 text-white shadow-xl backdrop-blur-md">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="mt-1 text-white/70">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StaffPerformanceChart data={staffPerformanceData} />
        <RoadmapGoalsChart data={roadmapGoalsData} />
      </div>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { StaffPerformanceChart } from '@/components/analytics/staff-performance-chart';
import { RoadmapGoalsChart } from '@/components/analytics/roadmap-goals-chart';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const { profile } = await getAuthState();
  if (profile!.role !== 'ceo') notFound();

  const t = await getTranslations('analytics');
  const supabase = await createClient();

  const [{ data: performance }, { data: goals }] = await Promise.all([
    supabase
      .from('staff_performance')
      .select('weekly_progress_score, staff:profiles!staff_performance_staff_id_fkey(first_name, last_name)'),
    supabase.from('roadmap_goals').select('title, progress_percentage, status'),
  ]);

  const staffPerformanceData = (performance ?? [])
    .filter((p) => p.staff)
    .map((p) => ({
      name: `${p.staff!.first_name} ${p.staff!.last_name}`,
      score: p.weekly_progress_score,
    }));

  const roadmapGoalsData = (goals ?? []).map((g) => ({
    name: g.title,
    progress: g.progress_percentage,
    status: g.status,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="rounded-3xl border border-white/20 bg-white/10 p-8 text-white shadow-xl backdrop-blur-md">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
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

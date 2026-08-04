import { Suspense } from 'react';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { StatsRow } from '@/components/dashboard/stats-row';
import { ActiveIssuesOverview } from '@/components/dashboard/active-issues-overview';
import { CompanyNewsCard } from '@/components/dashboard/company-news-card';
import { RolesDonutChart } from '@/components/dashboard/roles-donut-chart';
import { EmployeeGrowthChartCard } from '@/components/dashboard/employee-growth-chart-card';
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap';
import { SelfDevelopmentLineChart } from '@/components/self-development/self-development-line-chart';
import { GlassCardSkeleton, GlassStatsRowSkeleton } from '@/components/skeletons/glass-skeletons';

// User-specific and RLS-scoped — never attempt to prerender this route.
export const dynamic = 'force-dynamic';

async function TeacherSelfDevelopmentCard({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('self_development')
    .select('month, ceo_score')
    .eq('user_id', userId)
    .order('month', { ascending: true });
  return <SelfDevelopmentLineChart points={(data ?? []).map((s) => ({ month: s.month, ceoScore: s.ceo_score }))} />;
}

async function EmployeeGrowthChartSection() {
  const supabase = await createClient();
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('role', 'teacher')
    .eq('is_active', true)
    .order('first_name', { ascending: true });

  const firstTeacher = teachers?.[0] ?? null;
  const { data: points } = firstTeacher
    ? await supabase
        .from('self_development')
        .select('month, ceo_score')
        .eq('user_id', firstTeacher.id)
        .order('month', { ascending: true })
    : { data: null };

  return (
    <EmployeeGrowthChartCard
      teachers={teachers ?? []}
      initialTeacherId={firstTeacher?.id ?? null}
      initialPoints={(points ?? []).map((s) => ({ month: s.month, ceoScore: s.ceo_score }))}
    />
  );
}

// Every block fetches its own data and streams in behind its own Suspense
// boundary, so the grid paints immediately instead of the whole page
// blocking on the slowest of several independent Supabase queries.
export default async function DashboardPage() {
  const { user, profile } = await getAuthState();
  const isCeo = profile!.role === 'ceo' || profile!.role === 'it_developer';
  // Administrative Manager now gets the same personal dashboard as a
  // teacher (self-development chart, own stats) — see the role rework.
  const isAdminRole = isCeo;
  const analyticsHref = isCeo ? '/analytics' : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <Suspense fallback={<GlassStatsRowSkeleton />}>
        <StatsRow isAdminRole={isAdminRole} />
      </Suspense>

      {isAdminRole ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<GlassCardSkeleton />}>
            <ActiveIssuesOverview />
          </Suspense>
          <Suspense fallback={<GlassCardSkeleton />}>
            <CompanyNewsCard isAdmin />
          </Suspense>
        </div>
      ) : (
        <Suspense fallback={<GlassCardSkeleton />}>
          <CompanyNewsCard isAdmin={false} />
        </Suspense>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Suspense fallback={<GlassCardSkeleton />}>
          {isAdminRole ? <EmployeeGrowthChartSection /> : <RolesDonutChart href={analyticsHref} />}
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          <ActivityHeatmap href="/calendar" />
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          <TeacherSelfDevelopmentCard userId={user!.id} />
        </Suspense>
      </div>
    </div>
  );
}

import { Suspense } from 'react';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { StatsRow } from '@/components/dashboard/stats-row';
import { ActiveIssuesOverview } from '@/components/dashboard/active-issues-overview';
import { CompanyNewsCard } from '@/components/dashboard/company-news-card';
import { RolesDonutChart } from '@/components/dashboard/roles-donut-chart';
import { EmployeeGrowthChartCard } from '@/components/dashboard/employee-growth-chart-card';
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap';
import { SelfDevelopmentChart } from '@/components/self-development/self-development-chart';
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
  return <SelfDevelopmentChart points={(data ?? []).map((s) => ({ month: s.month, ceoScore: s.ceo_score }))} />;
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
  const isCeo = profile!.role === 'ceo';
  const isAdminRole = isCeo || profile!.role === 'admin_manager';
  // /analytics is now CEO-only (see analytics/page.tsx) — admin_manager is
  // an "admin role" for the rest of this dashboard but would 404 there, so
  // these two cards only link out for the CEO specifically.
  const analyticsHref = isCeo ? '/analytics' : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <Suspense fallback={<GlassStatsRowSkeleton />}>
        <StatsRow isAdminRole={isAdminRole} />
      </Suspense>

      <Suspense fallback={<GlassCardSkeleton />}>
        {isAdminRole ? <ActiveIssuesOverview /> : <CompanyNewsCard />}
      </Suspense>

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

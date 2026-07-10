import { Suspense } from 'react';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { StatsRow } from '@/components/dashboard/stats-row';
import { RecentGroupsPanel } from '@/components/dashboard/recent-groups-panel';
import { StaffRosterPanel } from '@/components/dashboard/staff-roster-panel';
import { CompanyNewsCard } from '@/components/dashboard/company-news-card';
import { RolesDonutChart } from '@/components/dashboard/roles-donut-chart';
import { EmployeeGrowthIndicator } from '@/components/dashboard/employee-growth-indicator';
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap';
import { GrowthChart } from '@/components/dashboard/growth-chart';
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

// Every block fetches its own data and streams in behind its own Suspense
// boundary, so the grid paints immediately instead of the whole page
// blocking on the slowest of several independent Supabase queries.
export default async function DashboardPage() {
  const { user, profile } = await getAuthState();
  const isAdminRole = profile!.role === 'ceo' || profile!.role === 'admin_manager';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <Suspense fallback={<GlassStatsRowSkeleton />}>
        <StatsRow isAdminRole={isAdminRole} />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Suspense fallback={<GlassCardSkeleton />}>
          <RecentGroupsPanel />
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          {isAdminRole ? <StaffRosterPanel /> : <CompanyNewsCard />}
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Suspense fallback={<GlassCardSkeleton />}>
          {isAdminRole ? <EmployeeGrowthIndicator href="/self-development" /> : <RolesDonutChart href="/analytics" />}
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          <ActivityHeatmap href="/calendar" />
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          {isAdminRole ? <GrowthChart href="/analytics" /> : <TeacherSelfDevelopmentCard userId={user!.id} />}
        </Suspense>
      </div>
    </div>
  );
}

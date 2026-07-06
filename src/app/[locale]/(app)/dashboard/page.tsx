import { Suspense } from 'react';
import { StatsRow } from '@/components/dashboard/stats-row';
import { RecentGroupsPanel } from '@/components/dashboard/recent-groups-panel';
import { StaffRosterPanel } from '@/components/dashboard/staff-roster-panel';
import { RolesDonutChart } from '@/components/dashboard/roles-donut-chart';
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap';
import { GrowthChart } from '@/components/dashboard/growth-chart';
import { GlassCardSkeleton, GlassStatsRowSkeleton } from '@/components/skeletons/glass-skeletons';

// User-specific and RLS-scoped — never attempt to prerender this route.
export const dynamic = 'force-dynamic';

// Every block fetches its own data and streams in behind its own Suspense
// boundary, so the grid paints immediately instead of the whole page
// blocking on the slowest of several independent Supabase queries.
export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <Suspense fallback={<GlassStatsRowSkeleton />}>
        <StatsRow />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Suspense fallback={<GlassCardSkeleton />}>
          <RecentGroupsPanel />
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          <StaffRosterPanel />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Suspense fallback={<GlassCardSkeleton />}>
          <RolesDonutChart />
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          <ActivityHeatmap />
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          <GrowthChart />
        </Suspense>
      </div>
    </div>
  );
}

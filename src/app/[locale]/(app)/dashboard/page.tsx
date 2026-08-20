import { Suspense } from 'react';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { StatsRow } from '@/components/dashboard/stats-row';
import { ActiveIssuesOverview } from '@/components/dashboard/active-issues-overview';
import { CompanyNewsCard } from '@/components/dashboard/company-news-card';
import { RolesDonutChart } from '@/components/dashboard/roles-donut-chart';
import { TeacherProgressChartCard } from '@/components/dashboard/teacher-progress-chart-card';
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap';
import { TasksCalendar } from '@/components/dashboard/tasks-calendar';
import { SelfDevelopmentLineChart } from '@/components/self-development/self-development-line-chart';
import { GlassCardSkeleton, GlassStatsRowSkeleton } from '@/components/skeletons/glass-skeletons';

// User-specific and RLS-scoped — never attempt to prerender this route.
export const dynamic = 'force-dynamic';

async function TeacherSelfDevelopmentCard({ userId, delayMs }: { userId: string; delayMs: number }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('self_development')
    .select('month, ceo_score')
    .eq('user_id', userId)
    .order('month', { ascending: true });
  return (
    <SelfDevelopmentLineChart
      points={(data ?? []).map((s) => ({ month: s.month, ceoScore: s.ceo_score }))}
      delayMs={delayMs}
    />
  );
}

// CEO-only: every active teacher's self-development score plotted as its
// own line on one shared chart, rather than the old single-teacher picker —
// pivoted here (one row per month, one column per teacher) so the client
// component stays a dumb renderer with no data-fetching of its own.
async function TeacherProgressChartSection({ delayMs }: { delayMs: number }) {
  const supabase = await createClient();
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('role', 'teacher')
    .eq('is_active', true)
    .order('first_name', { ascending: true });

  const teacherList = teachers ?? [];
  const { data: scores } =
    teacherList.length > 0
      ? await supabase
          .from('self_development')
          .select('month, ceo_score, user_id')
          .in(
            'user_id',
            teacherList.map((t) => t.id),
          )
          .not('ceo_score', 'is', null)
          .order('month', { ascending: true })
      : { data: null };

  const monthsInOrder: string[] = [];
  const rowByMonth = new Map<string, Record<string, number | null>>();
  for (const s of scores ?? []) {
    if (!rowByMonth.has(s.month)) {
      monthsInOrder.push(s.month);
      rowByMonth.set(s.month, {});
    }
    rowByMonth.get(s.month)![s.user_id] = s.ceo_score;
  }
  const data = monthsInOrder.map((month) => ({ month, ...rowByMonth.get(month) }));

  return (
    <TeacherProgressChartCard
      teachers={teacherList.map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}` }))}
      data={data}
      delayMs={delayMs}
    />
  );
}

// Every block fetches its own data and streams in behind its own Suspense
// boundary, so the grid paints immediately instead of the whole page
// blocking on the slowest of several independent Supabase queries.
export default async function DashboardPage() {
  const { user, profile } = await getAuthState();
  const isCeo = profile!.role === 'ceo';
  const isHeadTeacher = profile!.role === 'head_teacher';
  // Head Teacher gets a regular teacher's dashboard plus the Active
  // Groups/Lesson Plans cards (RLS already scopes both platform-wide for
  // it, same as CEO) — everyone else who isn't a teacher/assistant gets a
  // personal Finance/Missions/Tasks view instead of company-wide totals
  // that aren't relevant to their day-to-day (assistant keeps today's
  // teacher-like treatment — it's still operationally lesson-plan-focused,
  // unlike admin_manager/mmd/internship/it_developer).
  const isTeacherTier = profile!.role === 'teacher' || profile!.role === 'assistant' || isHeadTeacher;
  const isPersonalDashboard = !isCeo && !isTeacherTier;
  const analyticsHref = isCeo ? '/analytics' : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <Suspense fallback={<GlassStatsRowSkeleton />}>
        <StatsRow
          showTotalStaff={isCeo}
          showLessonPlanCards={!isPersonalDashboard}
          personalDashboardUserId={isPersonalDashboard ? user!.id : undefined}
        />
      </Suspense>

      {isCeo ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<GlassCardSkeleton />}>
            <ActiveIssuesOverview delayMs={0} />
          </Suspense>
          <Suspense fallback={<GlassCardSkeleton />}>
            <CompanyNewsCard isAdmin delayMs={90} />
          </Suspense>
        </div>
      ) : (
        <Suspense fallback={<GlassCardSkeleton />}>
          <CompanyNewsCard isAdmin={false} delayMs={0} />
        </Suspense>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {!isPersonalDashboard && (
          <Suspense fallback={<GlassCardSkeleton />}>
            {isCeo ? (
              <TeacherProgressChartSection delayMs={0} />
            ) : (
              <RolesDonutChart href={analyticsHref} delayMs={0} />
            )}
          </Suspense>
        )}
        <Suspense fallback={<GlassCardSkeleton />}>
          {isPersonalDashboard ? (
            <TasksCalendar userId={user!.id} />
          ) : (
            <ActivityHeatmap href="/calendar" delayMs={90} />
          )}
        </Suspense>
        <Suspense fallback={<GlassCardSkeleton />}>
          <TeacherSelfDevelopmentCard userId={user!.id} delayMs={180} />
        </Suspense>
      </div>
    </div>
  );
}

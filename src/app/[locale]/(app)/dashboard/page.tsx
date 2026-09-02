import { Suspense } from 'react';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { StatsRow } from '@/components/dashboard/stats-row';
import { ActiveIssuesOverview } from '@/components/dashboard/active-issues-overview';
import { CompanyNewsCard } from '@/components/dashboard/company-news-card';
import { TeacherProgressChartCard } from '@/components/dashboard/teacher-progress-chart-card';
import { StarLeaderboard } from '@/components/dashboard/star-leaderboard';
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap';
import { TasksCalendar } from '@/components/dashboard/tasks-calendar';
import { SelfDevelopmentLineChart } from '@/components/self-development/self-development-line-chart';
import { GlassCardSkeleton, GlassStatsRowSkeleton } from '@/components/skeletons/glass-skeletons';

// User-specific and RLS-scoped — never attempt to prerender this route.
export const dynamic = 'force-dynamic';

async function TeacherSelfDevelopmentCard({ userId, delayMs }: { userId: string; delayMs: number }) {
  const data = await sql<{ month: string; ceo_score: number | null }[]>`
    select month, ceo_score from self_development
    where user_id = ${userId}
    order by month asc
  `;
  return (
    <SelfDevelopmentLineChart
      points={data.map((s) => ({ month: s.month, ceoScore: s.ceo_score }))}
      delayMs={delayMs}
    />
  );
}

// CEO-only: every active teacher's self-development score plotted as its
// own line on one shared chart, rather than the old single-teacher picker —
// pivoted here (one row per month, one column per teacher) so the client
// component stays a dumb renderer with no data-fetching of its own.
async function TeacherProgressChartSection({ delayMs }: { delayMs: number }) {
  const teacherList = await sql<{ id: string; first_name: string; last_name: string }[]>`
    select id, first_name, last_name from profiles
    where role = 'teacher' and is_active = true
    order by first_name asc
  `;

  const scores =
    teacherList.length > 0
      ? await sql<{ month: string; ceo_score: number; user_id: string }[]>`
          select month, ceo_score, user_id from self_development
          where user_id in ${sql(teacherList.map((t) => t.id))} and ceo_score is not null
          order by month asc
        `
      : [];

  const monthsInOrder: string[] = [];
  const rowByMonth = new Map<string, Record<string, number | null>>();
  for (const s of scores) {
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
// blocking on the slowest of several independent database queries.
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
  // unlike admin_manager/mmd/internship/it_developer). Teacher
  // tier still gets its own Finance card alongside Active Groups/Lesson
  // Plans — every non-CEO role sees their own earnings on the dashboard,
  // just via a different card mix (see financeUserId on StatsRow).
  const isTeacherTier = profile!.role === 'teacher' || profile!.role === 'assistant' || isHeadTeacher;
  const isPersonalDashboard = !isCeo && !isTeacherTier;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <Suspense fallback={<GlassStatsRowSkeleton />}>
        <StatsRow
          showTotalStaff={isCeo}
          showLessonPlanCards={!isPersonalDashboard}
          personalDashboardUserId={isPersonalDashboard ? user!.id : undefined}
          financeUserId={isTeacherTier ? user!.id : undefined}
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
        {/* The role/"rules" breakdown is CEO-only now — no other role sees
            it. Only the CEO gets this chart cell. */}
        {isCeo && (
          <Suspense fallback={<GlassCardSkeleton />}>
            <TeacherProgressChartSection delayMs={0} />
          </Suspense>
        )}
        {/* Stars are company-wide and everyone earns them, so the
            leaderboard is the one card here with no role gate. For non-CEO
            roles it takes over the cell the CEO-only chart leaves empty;
            for the CEO it's a fourth card that wraps onto the next row. */}
        <Suspense fallback={<GlassCardSkeleton />}>
          <StarLeaderboard currentUserId={user!.id} delayMs={isCeo ? 90 : 0} />
        </Suspense>
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

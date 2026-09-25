import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { CircleAlert, ListTodo, Star, SquareCheckBig } from 'lucide-react';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { StatsRow } from '@/components/dashboard/stats-row';
import { StatsPeriodProvider } from '@/components/dashboard/stats-period';
import { ActiveIssuesOverview } from '@/components/dashboard/active-issues-overview';
import { CompanyNewsCard } from '@/components/dashboard/company-news-card';
import { TeacherProgressChartCard } from '@/components/dashboard/teacher-progress-chart-card';
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap';
import { TasksCalendar } from '@/components/dashboard/tasks-calendar';
import { SelfDevelopmentLineChart } from '@/components/self-development/self-development-line-chart';
import { GlassCardSkeleton, GlassStatsRowSkeleton } from '@/components/skeletons/glass-skeletons';
import {
  canSeeLessonPlans,
  loadActivity,
  loadDashboardCore,
  loadEmployeeTaskStats,
  loadFinanceSnapshot,
  loadLeaderboard,
  loadLessonPlanMonths,
  loadLessonPlanWeek,
  showsLessonPlanStats,
  loadTasksDoneMonths,
  loadTaskFeed,
  loadTasksDoneWeek,
  type Viewer,
} from '@/lib/aurora-dashboard';
import { loadEmployeeGrowth } from '@/lib/employee-growth';
import { SKELETON, SURFACE_CARD, SURFACE_HERO } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { StaffRole } from '@/lib/nav';
import { HeroBanner } from '@/components/aurora/hero-banner';
import { KpiCard } from '@/components/aurora/kpi-card';
import { Leaderboard } from '@/components/aurora/leaderboard';
import { WeekBarChart } from '@/components/aurora/week-bar-chart';
import { ActivityFeed } from '@/components/aurora/activity-feed';
import { FinanceCard } from '@/components/aurora/finance-card';
import { TaskFeed } from '@/components/aurora/task-feed';
import { EmployeeStatsTable } from '@/components/aurora/employee-stats-table';

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

// CEO-only: every active staff member's self-development score plotted as
// its own line on one shared chart. The pivot lives in lib/employee-growth.ts
// (shared with the CEO view of /self-development).
async function TeacherProgressChartSection({ delayMs }: { delayMs: number }) {
  const { teachers, data } = await loadEmployeeGrowth();
  return <TeacherProgressChartCard teachers={teachers} data={data} delayMs={delayMs} />;
}

/* ------------------------------ Persons Aurora top section ------------------------------ */

// Grid placement (xl, 12 cols) — mirrors persons-aurora-kit's reference:
//   hero 8    | leaderboard 4 (2 rows)
//   KPI×4 8   |
//   finance 8 | activity 4      (finance took the old task-status card's place)
//   tasks feed 7 | bars 5
//   employee statistics 12      (CEO only — the CEO has no "my tasks")
const HERO_CELL = 'lg:col-span-12 xl:col-span-8';
const LEAD_CELL = 'lg:col-span-6 xl:col-span-4 xl:col-start-9 xl:row-span-2 xl:row-start-1';
const KPI_CELL = 'lg:col-span-6 xl:col-span-8';
const FIN_CELL = 'lg:col-span-7 xl:col-span-8';
const ACT_CELL = 'lg:col-span-5 xl:col-span-4';
const FEED_CELL = 'lg:col-span-7';
const BARS_CELL = 'lg:col-span-5';
const STATS_CELL = 'lg:col-span-12';

const formatCount = (n: number) => new Intl.NumberFormat('ru-RU').format(n);

function Bar({ className }: { className?: string }) {
  return <div className={cn(SKELETON, className)} />;
}

function HeroAndKpiSkeleton() {
  return (
    <>
      <div className={cn(SURFACE_HERO, HERO_CELL, 'flex min-h-[252px] flex-col gap-3 p-7')}>
        <Bar className="h-4 w-48 bg-white/60" />
        <Bar className="h-10 w-72 bg-white/60" />
        <Bar className="h-4 w-full max-w-md bg-white/60" />
      </div>
      <div className={cn(KPI_CELL, 'grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 xl:grid-cols-4')}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn(SURFACE_CARD, 'flex min-h-[200px] flex-col gap-3 p-[18px]')}>
            <Bar className="h-4 w-24" />
            <Bar className="h-8 w-16" />
            <Bar className="mt-auto h-12 w-full" />
          </div>
        ))}
      </div>
    </>
  );
}

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(SURFACE_CARD, 'flex min-h-[260px] flex-col gap-3 p-5', className)}>
      <Bar className="h-5 w-36" />
      <Bar className="mt-auto h-32 w-full" />
    </div>
  );
}

async function HeroAndKpis({ viewer, firstName }: { viewer: Viewer; firstName: string }) {
  const t = await getTranslations('aurora');
  const { hero, kpis } = await loadDashboardCore(viewer.userId, viewer.role);
  const isCeo = viewer.role === 'ceo';

  return (
    <>
      <HeroBanner
        firstName={firstName}
        data={hero}
        showLessonPlans={canSeeLessonPlans(viewer.role)}
        className={HERO_CELL}
      />
      <div className={cn(KPI_CELL, 'grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 xl:grid-cols-4')}>
        {kpis ? (
          <>
            <KpiCard
              index={0}
              href="/tasks"
              label={t('kpiActiveTasks')}
              icon={ListTodo}
              value={formatCount(kpis.activeTasks.value)}
              delta={kpis.activeTasks.delta}
              higherIsBetter={false}
              caption={t('vsLastWeek')}
              bars={kpis.activeTasks.bars}
            />
            <KpiCard
              index={1}
              href="/issues"
              label={t('kpiIssues')}
              icon={CircleAlert}
              value={formatCount(kpis.openIssues.value)}
              delta={kpis.openIssues.delta}
              higherIsBetter={false}
              caption={t('resolved', { count: kpis.openIssues.extra ?? 0 })}
              bars={kpis.openIssues.bars}
            />
            <KpiCard
              index={2}
              href="/market"
              label={isCeo ? t('kpiStars') : t('kpiMyStars')}
              icon={Star}
              value={formatCount(kpis.stars.value)}
              delta={kpis.stars.delta}
              deltaUnit="absolute"
              caption={t('thisMonth')}
              bars={kpis.stars.bars}
            />
            <KpiCard
              index={3}
              href="/tasks"
              label={t('kpiDone')}
              icon={SquareCheckBig}
              value={formatCount(kpis.doneTasks.value)}
              delta={kpis.doneTasks.delta}
              caption={t('doneLast7', { count: kpis.doneTasks.extra ?? 0 })}
              bars={kpis.doneTasks.bars}
            />
          </>
        ) : (
          <div className={cn(SURFACE_CARD, 'col-span-full p-6 text-center text-sm text-au-muted')}>{t('noData')}</div>
        )}
      </div>
    </>
  );
}

async function LeaderboardSection({ userId }: { userId: string }) {
  const people = await loadLeaderboard();
  return <Leaderboard people={people} currentUserId={userId} className={LEAD_CELL} />;
}

async function WeekChartSection({ viewer }: { viewer: Viewer }) {
  const t = await getTranslations('aurora');
  // Teacher tier only — lesson-plan completion is never a company stat.
  const lessons = showsLessonPlanStats(viewer.role);
  const [week, months] = lessons
    ? await Promise.all([loadLessonPlanWeek(viewer), loadLessonPlanMonths(viewer)])
    : await Promise.all([loadTasksDoneWeek(viewer), loadTasksDoneMonths(viewer)]);
  return (
    <WeekBarChart
      title={lessons ? t('lessonPlansChart') : t('tasksWeekChart')}
      href={lessons ? '/lesson-plans' : '/tasks'}
      week={week}
      months={months}
      className={BARS_CELL}
    />
  );
}

async function FinanceSection({ viewer }: { viewer: Viewer }) {
  const data = await loadFinanceSnapshot(viewer);
  return (
    <FinanceCard
      data={data}
      href={viewer.role === 'ceo' ? '/finance' : `/finance/${viewer.userId}`}
      className={FIN_CELL}
    />
  );
}

async function TaskFeedSection({ viewer }: { viewer: Viewer }) {
  const items = await loadTaskFeed(viewer);
  return <TaskFeed items={items} mode={viewer.role === 'ceo' ? 'ceo' : 'self'} className={FEED_CELL} />;
}

async function EmployeeStatsSection() {
  const rows = await loadEmployeeTaskStats();
  return <EmployeeStatsTable rows={rows} className={STATS_CELL} />;
}

async function ActivitySection({ viewer }: { viewer: Viewer }) {
  const items = await loadActivity(viewer);
  return <ActivityFeed items={items} href={viewer.role === 'ceo' ? '/staff' : '/profile'} className={ACT_CELL} />;
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
  // personal Finance/Tasks view instead of company-wide totals
  // that aren't relevant to their day-to-day (assistant keeps today's
  // teacher-like treatment — it's still operationally lesson-plan-focused,
  // unlike admin_manager/mmd/internship/it_developer). Teacher
  // tier still gets its own Finance card alongside Active Groups/Lesson
  // Plans — every non-CEO role sees their own earnings on the dashboard,
  // just via a different card mix (see financeUserId on StatsRow).
  const isTeacherTier = profile!.role === 'teacher' || profile!.role === 'assistant' || isHeadTeacher;
  const isPersonalDashboard = !isCeo && !isTeacherTier;

  const viewer: Viewer = { userId: user!.id, role: profile!.role as StaffRole };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-[18px] px-4 pt-1 pb-7 sm:px-7">
      {/* Persons Aurora overview — hero, leaderboard, KPIs, charts, activity. */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-12">
        <Suspense fallback={<HeroAndKpiSkeleton />}>
          <HeroAndKpis viewer={viewer} firstName={profile!.first_name} />
        </Suspense>
        <Suspense fallback={<CardSkeleton className={cn(LEAD_CELL, 'min-h-[520px]')} />}>
          <LeaderboardSection userId={user!.id} />
        </Suspense>
        <Suspense fallback={<CardSkeleton className={FIN_CELL} />}>
          <FinanceSection viewer={viewer} />
        </Suspense>
        <Suspense fallback={<CardSkeleton className={ACT_CELL} />}>
          <ActivitySection viewer={viewer} />
        </Suspense>
        <Suspense fallback={<CardSkeleton className={FEED_CELL} />}>
          <TaskFeedSection viewer={viewer} />
        </Suspense>
        <Suspense fallback={<CardSkeleton className={BARS_CELL} />}>
          <WeekChartSection viewer={viewer} />
        </Suspense>
        {isCeo && (
          <Suspense fallback={<CardSkeleton className={STATS_CELL} />}>
            <EmployeeStatsSection />
          </Suspense>
        )}
      </div>

      {/* The period selector's state lives in this provider, above the
          streamed server cards, so a realtime router.refresh() re-renders
          them without resetting the viewer's kunlik/haftalik/oylik choice. */}
      <StatsPeriodProvider>
        <Suspense fallback={<GlassStatsRowSkeleton />}>
          <StatsRow
            showTotalStaff={isCeo}
            showLessonPlanCards={!isPersonalDashboard}
            showLessonPlanCount={isTeacherTier}
            personalDashboardUserId={isPersonalDashboard ? user!.id : undefined}
            financeUserId={isTeacherTier ? user!.id : undefined}
          />
        </Suspense>
      </StatsPeriodProvider>

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

import { Reveal } from '@/components/motion/reveal';
import { getFormatter, getTranslations } from 'next-intl/server';
import { CircleAlert, ListTodo, Star, SquareCheckBig } from 'lucide-react';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { NewsSliderView } from '@/components/dashboard/news-slider';
import { ActiveIssuesOverview } from '@/components/dashboard/active-issues-overview';
import { TeacherProgressChartCard } from '@/components/dashboard/teacher-progress-chart-card';
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap';
import { SelfDevelopmentLineChart } from '@/components/self-development/self-development-line-chart';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';
import {
  canSeeLessonPlans,
  loadActivity,
  loadDashboardCore,
  loadEmployeeTaskStats,
  loadLastMonthTop3,
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
import { TaskFeed } from '@/components/aurora/task-feed';
import { EmployeeStatsTable } from '@/components/aurora/employee-stats-table';
import { MonthTop3 } from '@/components/aurora/month-top3';
import { SelfDevReminder } from '@/components/aurora/self-dev-reminder';
import { KpiReminder } from '@/components/aurora/kpi-reminder';
import { monthName, shiftMonth } from '@/lib/kpi-plan';
import { tashkentMonthKey, tashkentYmd } from '@/lib/time';
import { firstOfCurrentMonth } from '@/lib/self-development';
import { can } from '@/lib/permissions';

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
// Finance card is gone (owner, 2026-10-04) — activity takes the full row.
const ACT_CELL = 'lg:col-span-12';
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
  const isCeo = can(viewer.role, 'company.overview');

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

async function LeaderboardSection({ userId, compact }: { userId: string; compact: boolean }) {
  const people = await loadLeaderboard();
  return <Leaderboard people={people} currentUserId={userId} compact={compact} className={LEAD_CELL} />;
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

async function TaskFeedSection({ viewer }: { viewer: Viewer }) {
  const items = await loadTaskFeed(viewer);
  return <TaskFeed items={items} mode={can(viewer.role, 'company.overview') ? 'ceo' : 'self'} className={FEED_CELL} />;
}

async function EmployeeStatsSection() {
  const rows = await loadEmployeeTaskStats();
  return <EmployeeStatsTable rows={rows} className={STATS_CELL} />;
}

async function SelfDevReminderSection({ userId, reviewer }: { userId: string; reviewer: boolean }) {
  if (reviewer) return null;
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from self_development where user_id = ${userId} and month = ${firstOfCurrentMonth()}
  `.catch(() => [{ n: 1 }]);
  return row && row.n > 0 ? null : <SelfDevReminder />;
}

async function KpiReminderSection({ userId, reviewer }: { userId: string; reviewer: boolean }) {
  const thisMonth = `${tashkentMonthKey()}-01`;
  const next = shiftMonth(thisMonth, 1);
  if (reviewer) {
    const [r] = await sql<{ n: number }[]>`
      select count(*)::int as n from kpi_plans where status = 'submitted' and month in (${thisMonth}, ${next})`.catch(() => [{ n: 0 }]);
    return r?.n ? (
      <KpiReminder title={`${r.n} ta KPI rejasi tasdiq kutmoqda`} body="Ko‘rib chiqing: tasdiqlang yoki izoh bilan qaytaring." cta="Ko‘rib chiqish" />
    ) : null;
  }
  // The employee: this month's plan if it's missing, otherwise next month's
  // from 7 days before the deadline (the last day, 23:59).
  const { year, month, day } = tashkentYmd();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rows = await sql<{ month: string }[]>`
    select month::text as month from kpi_plans
    where user_id = ${userId} and month in (${thisMonth}, ${next}) and status in ('submitted', 'approved')`.catch(() => null);
  if (!rows) return null;
  const has = (m: string) => rows.some((r) => r.month === m);
  if (!has(thisMonth))
    return <KpiReminder title={`${monthName(thisMonth)} KPI rejangiz yo‘q`} body="Joriy oy rejasini uch ssenariyda kiriting va CEO’ga topshiring." cta="Rejani kiritish" />;
  if (day >= lastDay - 7 && !has(next))
    return (
      <KpiReminder
        title={`${monthName(next)} KPI rejasini topshiring`}
        body={`Muddat: ${lastDay}-sana, 23:59. Uch ssenariy — yomon, yaxshi, juda yaxshi.`}
        cta="Rejani kiritish"
      />
    );
  return null;
}

async function MonthTop3Section({ viewerId }: { viewerId: string }) {
  const top = await loadLastMonthTop3();
  return top ? <MonthTop3 month={top.month} people={top.people} viewerId={viewerId} /> : null;
}

async function NewsSliderSection() {
  const [t, format] = await Promise.all([getTranslations('dashboard'), getFormatter()]);
  const news = await sql<{ id: string; title: string; content: string; created_at: string }[]>`
    select id, title, content, created_at from company_news
    order by created_at desc limit 6
  `.catch(() => []);
  return (
    <NewsSliderView
      title={t('companyNews.title')}
      allLabel={t('companyNews.all')}
      items={news.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content.replace(/\s+/g, ' ').slice(0, 220),
        date: format.dateTime(new Date(n.created_at), { dateStyle: 'medium' }),
      }))}
    />
  );
}

async function ActivitySection({ viewer }: { viewer: Viewer }) {
  const items = await loadActivity(viewer);
  return <ActivityFeed items={items} href={can(viewer.role, 'company.overview') ? '/staff' : '/profile'} className={ACT_CELL} />;
}

// Every block fetches its own data and streams in behind its own Suspense
// boundary, so the grid paints immediately instead of the whole page
// blocking on the slowest of several independent database queries.
export default async function DashboardPage() {
  const { user, profile } = await getAuthState();
  const isCeo = can(profile!.role, 'company.overview');

  const viewer: Viewer = { userId: user!.id, role: profile!.role as StaffRole };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-[18px] px-4 pt-1 pb-7 sm:px-7">
      {/* Latest company news, rotating every 3 s — the first thing on the page. */}
      <Reveal fallback={null}>
        <NewsSliderSection />
      </Reveal>
      {/* Monthly self-development is mandatory for everyone but the CEO. */}
      <Reveal fallback={null}>
        <SelfDevReminderSection userId={user!.id} reviewer={can(profile!.role, 'selfDev.review')} />
      </Reveal>
      <Reveal fallback={null}>
        <KpiReminderSection userId={user!.id} reviewer={can(profile!.role, 'kpi.review')} />
      </Reveal>
      {/* Persons Aurora overview — hero, leaderboard, KPIs, charts, activity. */}
      <div data-stagger className="grid grid-cols-1 gap-[18px] lg:grid-cols-12">
        <Reveal fallback={<HeroAndKpiSkeleton />}>
          <HeroAndKpis viewer={viewer} firstName={profile!.first_name} />
        </Reveal>
        <Reveal fallback={<CardSkeleton className={cn(LEAD_CELL, 'min-h-[520px]')} />}>
          <LeaderboardSection userId={user!.id} compact={!isCeo} />
        </Reveal>
        <Reveal fallback={<CardSkeleton className={ACT_CELL} />}>
          <ActivitySection viewer={viewer} />
        </Reveal>
        <Reveal fallback={<CardSkeleton className={FEED_CELL} />}>
          <TaskFeedSection viewer={viewer} />
        </Reveal>
        <Reveal fallback={<CardSkeleton className={BARS_CELL} />}>
          <WeekChartSection viewer={viewer} />
        </Reveal>
        {isCeo && (
          <Reveal fallback={<CardSkeleton className={STATS_CELL} />}>
            <EmployeeStatsSection />
          </Reveal>
        )}
      </div>

      {/* Last month's top 3 — below this month's leaderboard, all month long. */}
      <Reveal fallback={null}>
        <MonthTop3Section viewerId={user!.id} />
      </Reveal>

      {isCeo && (
        <Reveal fallback={<GlassCardSkeleton />}>
          <ActiveIssuesOverview delayMs={0} />
        </Reveal>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* The role/"rules" breakdown is CEO-only now — no other role sees
            it. Only the CEO gets this chart cell. */}
        {isCeo && (
          <Reveal fallback={<GlassCardSkeleton />}>
            <TeacherProgressChartSection delayMs={0} />
          </Reveal>
        )}
        <Reveal fallback={<GlassCardSkeleton />}>
          {/* Company-wide chat activity is overview data (CEO only). */}
          {isCeo ? <ActivityHeatmap href="/calendar" delayMs={90} /> : null}
        </Reveal>
        <Reveal fallback={<GlassCardSkeleton />}>
          <TeacherSelfDevelopmentCard userId={user!.id} delayMs={180} />
        </Reveal>
      </div>
    </div>
  );
}

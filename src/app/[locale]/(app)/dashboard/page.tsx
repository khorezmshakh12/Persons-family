import { Reveal } from '@/components/motion/reveal';
import { getFormatter, getTranslations } from 'next-intl/server';
import { CircleAlert, GraduationCap, ListTodo, Map, Star, SquareCheckBig, Target } from 'lucide-react';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { NewsSliderView } from '@/components/dashboard/news-slider';
import { ActiveIssuesOverview } from '@/components/dashboard/active-issues-overview';
import { TeacherProgressChartCard } from '@/components/dashboard/teacher-progress-chart-card';
import { SelfDevelopmentLineChart } from '@/components/self-development/self-development-line-chart';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';
import {
  canSeeLessonPlans,
  loadActivity,
  loadAttention,
  loadCeoPulse,
  loadDashboardCore,
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
import { MonthTop3 } from '@/components/aurora/month-top3';
import { AttentionPanel } from '@/components/aurora/attention-panel';
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

/* ------------------------------ Persons Aurora command center ------------------------------ */

// Layout (xl, 12 cols) — "pulse → needs attention → trends":
//   main 8: hero · pulse KPIs · needs attention · own work / issues · activity
//   side 4: star leaderboard · last month's top 3 · company news
//   full 12: growth chart
// No finance / sales figures on the dashboard (owner, 2026-10-04).
const FEED_CELL = 'lg:col-span-7';
const BARS_CELL = 'lg:col-span-5';

const formatCount = (n: number) => new Intl.NumberFormat('en-US').format(n);

function Bar({ className }: { className?: string }) {
  return <div className={cn(SKELETON, className)} />;
}

function HeroAndKpiSkeleton() {
  return (
    <>
      <div className={cn(SURFACE_HERO, 'flex min-h-[252px] flex-col gap-3 p-7')}>
        <Bar className="h-4 w-48 bg-white/60" />
        <Bar className="h-10 w-72 bg-white/60" />
        <Bar className="h-4 w-full max-w-md bg-white/60" />
      </div>
      <div className="grid grid-cols-2 gap-[18px] lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={cn(SURFACE_CARD, 'flex min-h-[176px] flex-col gap-3 p-[18px]')}>
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
  const isCeo = can(viewer.role, 'company.overview');
  const [{ hero, kpis }, pulse] = await Promise.all([
    loadDashboardCore(viewer.userId, viewer.role),
    isCeo ? loadCeoPulse() : Promise.resolve(null),
  ]);
  const pct = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);

  return (
    <>
      <HeroBanner firstName={firstName} data={hero} showLessonPlans={canSeeLessonPlans(viewer.role)} />
      <section
        aria-label={t('pulse')}
        className={cn('grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2', isCeo ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}
      >
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
            {/* "Completed tasks" left the CEO dashboard (owner, 2026-10-06). */}
            {!isCeo && (
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
            )}
            {/* CEO compliance meters: who has filed this month's KPI plan and
                self-development report, and how far strategy has come. */}
            {pulse && (
              <>
                <KpiCard
                  index={3}
                  href="/my-kpi"
                  label={t('kpiPlans')}
                  icon={Target}
                  value={`${pulse.kpiFiled}/${pulse.staff}`}
                  delta={pulse.kpiWaiting || null}
                  deltaUnit="absolute"
                  higherIsBetter={false}
                  caption={pulse.kpiWaiting ? t('waitingApproval') : t('thisMonth')}
                  meter={pct(pulse.kpiFiled, pulse.staff)}
                />
                <KpiCard
                  index={4}
                  href="/self-development"
                  label={t('kpiSelfDev')}
                  icon={GraduationCap}
                  value={`${pulse.selfDevFiled}/${pulse.staff}`}
                  delta={pulse.selfDevUnrated || null}
                  deltaUnit="absolute"
                  higherIsBetter={false}
                  caption={pulse.selfDevUnrated ? t('unrated') : t('thisMonth')}
                  meter={pct(pulse.selfDevFiled, pulse.staff)}
                />
                <KpiCard
                  index={5}
                  href="/strategy"
                  label={t('kpiStrategy')}
                  icon={Map}
                  value={`${Math.round(pct(pulse.strategyDone, pulse.strategyTotal))}%`}
                  delta={null}
                  caption={t('strategyCaption', { done: pulse.strategyDone, total: pulse.strategyTotal })}
                  meter={pct(pulse.strategyDone, pulse.strategyTotal)}
                />
              </>
            )}
          </>
        ) : (
          <div className={cn(SURFACE_CARD, 'col-span-full p-6 text-center text-sm text-au-muted')}>{t('noData')}</div>
        )}
      </section>
    </>
  );
}

async function LeaderboardSection({ userId, compact }: { userId: string; compact: boolean }) {
  const people = await loadLeaderboard();
  return <Leaderboard people={people} currentUserId={userId} compact={compact} />;
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


async function AttentionSection({ viewer }: { viewer: Viewer }) {
  const items = await loadAttention(viewer);
  return <AttentionPanel items={items} />;
}

async function MonthTop3Section({ viewerId }: { viewerId: string }) {
  const top = await loadLastMonthTop3();
  return top ? <MonthTop3 stacked month={top.month} people={top.people} viewerId={viewerId} /> : null;
}

async function NewsSliderSection() {
  const [t, format] = await Promise.all([getTranslations('dashboard'), getFormatter()]);
  const news = await sql<{ id: string; title: string; content: string; created_at: string }[]>`
    select id, title, content, created_at from company_news
    where deleted_at is null and (publish_at is null or publish_at <= now())
    order by pinned desc, created_at desc limit 6
  `.catch(() => []);
  return (
    <NewsSliderView
      flat
      className="lg:col-span-2 xl:col-span-1"
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
  return <ActivityFeed items={items} href={can(viewer.role, 'company.overview') ? '/staff' : '/profile'} />;
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
      <div data-stagger className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-12">
        {/* Main column: pulse -> needs attention -> work. */}
        <div className="flex min-w-0 flex-col gap-[18px] xl:col-span-8">
          <Reveal fallback={<HeroAndKpiSkeleton />}>
            <HeroAndKpis viewer={viewer} firstName={profile!.first_name} />
          </Reveal>
          {/* Replaces the KPI / self-development reminder banners: every
              deadline and approval queue in one actionable list. */}
          <Reveal fallback={<CardSkeleton className="min-h-[180px]" />}>
            <AttentionSection viewer={viewer} />
          </Reveal>
          {/* CEO dashboard trimmed (owner, 2026-10-06): no "completed tasks"
              chart / staff task feed; employee statistics live in HR. */}
          {isCeo ? (
            <Reveal fallback={<GlassCardSkeleton />}>
              <ActiveIssuesOverview delayMs={0} />
            </Reveal>
          ) : (
            <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-12">
              <Reveal fallback={<CardSkeleton className={FEED_CELL} />}>
                <TaskFeedSection viewer={viewer} />
              </Reveal>
              <Reveal fallback={<CardSkeleton className={BARS_CELL} />}>
                <WeekChartSection viewer={viewer} />
              </Reveal>
            </div>
          )}
          <Reveal fallback={<CardSkeleton />}>
            <ActivitySection viewer={viewer} />
          </Reveal>
        </div>

        {/* Side column: recognition and news. Last month's top 3 sits right
            under this month's leaderboard, news under the star rating
            (owner, 2026-10-04 / 10-06). */}
        <aside className="grid min-w-0 grid-cols-1 gap-[18px] lg:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          <Reveal fallback={<CardSkeleton className="min-h-[520px]" />}>
            <LeaderboardSection userId={user!.id} compact={!isCeo} />
          </Reveal>
          <Reveal fallback={null}>
            <MonthTop3Section viewerId={user!.id} />
          </Reveal>
          <Reveal fallback={null}>
            <NewsSliderSection />
          </Reveal>
        </aside>
      </div>

      {/* Trends: the CEO sees every employee's self-development growth,
          everyone else their own scores. */}
      <Reveal fallback={<GlassCardSkeleton />}>
        {isCeo ? <TeacherProgressChartSection delayMs={0} /> : <TeacherSelfDevelopmentCard userId={user!.id} delayMs={180} />}
      </Reveal>
    </div>
  );
}

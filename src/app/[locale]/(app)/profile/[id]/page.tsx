import { Suspense, ViewTransition } from 'react';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { SURFACE_HERO } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { ProfileTabs } from '@/components/profile/profile-tabs';
import { roleLabel } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TeacherLevelBadge } from '@/components/staff/teacher-level-badge';
import type { TeacherLevel } from '@/lib/teacher-level';
import { ContactInfoCard } from '@/components/profile/contact-info-card';
import { SelfDevelopmentSection } from '@/components/profile/self-development-section';
import { StarBalanceCard } from '@/components/profile/star-balance-card';
import { WarningsCard } from '@/components/profile/warnings-card';
import { MonthlyWarningsArchive } from '@/components/profile/monthly-warnings-archive';
import { MonthlyStarsArchive } from '@/components/profile/monthly-stars-archive';
import { getMonthlyWarningsArchiveAction } from '@/lib/actions/warnings';
import { getMonthlyStarsArchiveAction } from '@/lib/actions/stars';
import { MarkWarningsSeen } from '@/components/profile/mark-warnings-seen';
import { BonusesPunishmentsCard } from '@/components/profile/bonuses-punishments-card';
import { DutiesCard } from '@/components/profile/duties-card';
import { ContractsCard } from '@/components/profile/contracts-card';
import { SectionErrorBoundary } from '@/components/profile/section-error-boundary';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';
import { can } from '@/lib/permissions';
import { BgVideo } from '@/components/motion/bg-video';
import { tashkentDayKey, startOfTashkentMonthKey } from '@/lib/time';
import {
  loadOneOnOnes,
  loadPrivateNotes,
  loadProfileActivity,
  loadProfileCard,
  loadProfileMetrics,
  loadSkills,
  loadWork,
} from '@/lib/profile-insights';
import { AboutCard, AccountTab, ActivityCard, MetricsCard, PeopleTab, ProfileStrip, WorkTab } from '@/components/profile/profile-hub';
import { PayStatement } from '@/components/finance/pay-statement';
import { loadPayHistory, loadPayLines, loadPayRun } from '@/lib/pay-run-data';

export const dynamic = 'force-dynamic';

/* Both archives below are thin async wrappers so each one streams behind its
 * own Suspense boundary, exactly like the cards they sit under — fetching
 * them in the page body instead would block the whole profile on a query
 * that only feeds one collapsed section. Both actions carry their own
 * visibility gate and return [] rather than throwing, and both components
 * render nothing on an empty list, so a staff member with no history simply
 * sees no archive. */
async function WarningsArchiveSection({ staffId }: { staffId: string }) {
  return <MonthlyWarningsArchive months={await getMonthlyWarningsArchiveAction(staffId)} />;
}

async function StarsArchiveSection({ staffId }: { staffId: string }) {
  return <MonthlyStarsArchive months={await getMonthlyStarsArchiveAction(staffId)} />;
}

// Every section below fetches its own data independently and streams in
// behind its own Suspense boundary, wrapped in its own error boundary —
// the same resilience pattern the dashboard already uses. Before this
// rewrite, all six sections rendered as one synchronous block with no
// isolation at all: one slow or transiently-failing query in ANY section
// blocked (or crashed) the entire page, which was the actual root cause of
// this page's recurring "sometimes doesn't load / kicks me out" bug —
// wrapping each section individually means a single bad query now only
// degrades that one card instead of taking the whole route down.
//
// Exported (not just the default below) so /profile/page.tsx can render a
// viewer's own profile in place instead of redirect()-ing here — a
// same-segment-tree redirect() out of a route that has a loading.tsx runs
// in Next's "streaming" mode (a client-side meta-redirect rather than a
// clean HTTP 307), which under Next 16's rewritten navigation/prefetch
// layer was intermittently corrupting the client router's cache-node tree
// on soft navigation and surfacing as a React #310 crash (a useMemo
// dependency array changing size) — a white screen with no server-side
// error at all. Same fix applied to /finance.
export async function ProfileDetailContent({
  id,
  month,
  tab: tabParam,
  hrefBase,
}: {
  id: string;
  month?: string;
  tab?: string;
  /** Where the tab links point: '/profile' for "my profile", else /profile/[id]. */
  hrefBase?: string;
}) {
  const tStaff = await getTranslations('staff');
  const tProfile = await getTranslations('profile');
  const locale = await getLocale();
  const { user, profile: viewerProfile } = await getAuthState();

  const isSelf = user!.id === id;
  // Full profile (self-development, duties, contracts, management): CEO/COO.
  // Warnings/bonuses/punishments: warnings.manage (adds Admin Manager).
  const isCeo = can(viewerProfile!.role, 'company.overview');
  const isAdmin = isCeo;
  const isAdminManager = !isAdmin && can(viewerProfile!.role, 'warnings.manage');
  // Warnings/bonuses/punishments are visible to CEO and Administrative
  // Manager for anyone (mirrors is_ceo_or_admin_manager() RLS);
  // self-development, duties, and contracts stay admin-or-self only
  // (mirrors their own RLS, which never granted admin_manager access to
  // those tables).
  const canView = isSelf || isAdmin || isAdminManager;
  if (!canView) redirect({ href: '/dashboard', locale });

  const canViewCeoScoped = isSelf || isAdmin;
  const canManageWarnings = !isSelf && (isAdmin || isAdminManager);
  const canManage = !isSelf && isAdmin;
  const sectionErrorMessage = tProfile('sectionError');

  const [target] = await sql<
    {
      id: string;
      first_name: string;
      last_name: string;
      phone: string;
      emergency_contact: string | null;
      avatar_url: string | null;
      role: string;
      teacher_level: TeacherLevel | null;
      telegram_id: number | null;
    }[]
  >`
    select id, first_name, last_name, phone, emergency_contact, avatar_url, role, teacher_level, telegram_id
    from profiles where id = ${id}
  `;
  if (!target) notFound();

  // Tabs; only the open tab's cards are rendered (and fetched).
  // Work / 1:1 / account (sections v5) sit next to the original five.
  const CEO_SCOPED = new Set(['stars', 'growth', 'work', 'people']);
  const tabs = (['overview', 'work', 'stars', 'finance', 'discipline', 'growth', 'people', 'account'] as const).filter(
    (k) => (canViewCeoScoped || !CEO_SCOPED.has(k)) && (k !== 'account' || isSelf || isAdmin),
  );
  const tab = (tabs as readonly string[]).includes(tabParam ?? '') ? (tabParam as (typeof tabs)[number]) : 'overview';
  const NEW_LABELS: Record<string, string> = { work: 'Ish', people: '1:1', account: 'Hisob' };
  const tabLabels = Object.fromEntries(tabs.map((k) => [k, NEW_LABELS[k] ?? tProfile(`tabs.${k}`)]));
  const avatarSignedUrl = await resolveAvatarUrl(target.avatar_url);
  const today = tashkentDayKey();
  const period = startOfTashkentMonthKey();

  const [card, metrics, positions, people] = await Promise.all([
    loadProfileCard(id),
    canViewCeoScoped ? loadProfileMetrics(id) : Promise.resolve(null),
    sql<{ role: string }[]>`select role::text as role from profile_roles where user_id = ${id}`,
    isAdmin && !isSelf
      ? sql<{ id: string; name: string }[]>`select id, trim(concat(first_name, ' ', last_name)) as name from profiles where is_active order by first_name`
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const positionNames = [...new Set([target.role, ...positions.map((r) => r.role)])].map((r) => roleLabel(tStaff, r));
  const [activity, skills, work, meetings, privateNotes, payLines, payRun, payHistory] = await Promise.all([
    tab === 'overview' && canViewCeoScoped ? loadProfileActivity(id, true) : Promise.resolve([]),
    tab === 'overview' ? loadSkills(id) : Promise.resolve([]),
    tab === 'work' ? loadWork(id) : Promise.resolve(null),
    tab === 'people' ? loadOneOnOnes(id) : Promise.resolve([]),
    tab === 'people' && isAdmin && !isSelf ? loadPrivateNotes(id) : Promise.resolve(null),
    tab === 'finance' && canViewCeoScoped ? loadPayLines(period, id) : Promise.resolve([]),
    tab === 'finance' && canViewCeoScoped ? loadPayRun(period) : Promise.resolve(null),
    tab === 'finance' && canViewCeoScoped ? loadPayHistory(period, id) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      {isSelf && <MarkWarningsSeen />}
      <div
        style={{ animationDelay: '0ms' }}
        className={cn(SURFACE_HERO, 'enter-rise flex items-center gap-4 px-6 py-6 sm:px-[30px] sm:py-7')}
      >
        <BgVideo variant="hero" />
        <Avatar
          className="size-16 border border-au-line"
          style={{ viewTransitionName: `avatar-${target.id}`, viewTransitionClass: 'morph' }}
        >
          <AvatarImage src={avatarSignedUrl ?? undefined} alt="" />
          <AvatarFallback className="text-lg">
            {target.first_name?.[0] ?? ''}
            {target.last_name?.[0] ?? ''}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">
            {target.first_name} {target.last_name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-au-muted">{roleLabel(tStaff, target.role)}</span>
            {target.teacher_level && <TeacherLevelBadge level={target.teacher_level} />}
          </div>
        </div>
      </div>

      <ProfileStrip
        staffId={id}
        card={card}
        positions={positionNames}
        today={today}
        isSelf={isSelf}
        isLead={isAdmin && !isSelf}
        metrics={metrics ?? { months: [], series: { tasksDone: [], onTime: [], kpi: [], selfDev: [], stars: [], issues: [] } }}
        name={`${target.first_name} ${target.last_name}`}
      />

      <ProfileTabs current={tab} tabs={tabs} hrefBase={hrefBase ?? `/profile/${id}`} labels={tabLabels} />

      {/* Switching tabs crossfades the content (#4, motion-v4.css). */}
      <ViewTransition key={tab} enter="page-in" exit="page-out" default="none">
        <div className="flex flex-col gap-6">
          {tab === 'overview' && (
            <>
            {metrics && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <MetricsCard metrics={metrics} people={people} staffId={id} isLead={isAdmin && !isSelf} />
                <ActivityCard items={activity} />
              </div>
            )}
            <AboutCard staffId={id} bio={card.bio} skills={skills} canEdit={isSelf || isAdmin} isLead={isAdmin} />
            <div className="enter-rise" style={{ animationDelay: '70ms' }}>
              <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
                <Suspense fallback={<GlassCardSkeleton />}>
                  <ContactInfoCard profile={target} isSelf={isSelf} />
                </Suspense>
              </SectionErrorBoundary>
            </div>
              {canViewCeoScoped && (
                <>
            <div className="enter-rise" style={{ animationDelay: '120ms' }}>
              <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
                <Suspense fallback={<GlassCardSkeleton />}>
                  <DutiesCard staffId={id} canManage={canManage} />
                </Suspense>
              </SectionErrorBoundary>
            </div>
            <div className="enter-rise" style={{ animationDelay: '170ms' }}>
              <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
                <Suspense fallback={<GlassCardSkeleton />}>
                  <ContractsCard staffId={id} isSelf={isSelf} canManage={canManage} />
                </Suspense>
              </SectionErrorBoundary>
            </div>
                </>
              )}
            </>
          )}

          {tab === 'stars' && canViewCeoScoped && (
            <>
            <div className="enter-rise" style={{ animationDelay: '70ms' }}>
              <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
                <Suspense fallback={<GlassCardSkeleton />}>
                  <StarBalanceCard staffId={id} canManage={canManage} />
                </Suspense>
              </SectionErrorBoundary>
            </div>
            <div className="enter-rise" style={{ animationDelay: '120ms' }}>
              <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
                <Suspense fallback={null}>
                  <StarsArchiveSection staffId={id} />
                </Suspense>
              </SectionErrorBoundary>
            </div>
            </>
          )}

          {tab === 'finance' && (
            <>
              {canViewCeoScoped && payRun && (
                <PayStatement line={payLines[0] ?? null} period={period} status={payRun.status} history={payHistory} advances={null} isSelf={false} />
              )}
            <div className="enter-rise" style={{ animationDelay: '120ms' }}>
              <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
                <Suspense fallback={<GlassCardSkeleton />}>
                  <BonusesPunishmentsCard staffId={id} canManage={canManage} />
                </Suspense>
              </SectionErrorBoundary>
            </div>
            </>
          )}

          {tab === 'discipline' && (
            <>
            <div className="enter-rise" style={{ animationDelay: '70ms' }}>
              <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
                <Suspense fallback={<GlassCardSkeleton />}>
                  <WarningsCard staffId={id} canManage={canManageWarnings} />
                </Suspense>
              </SectionErrorBoundary>
            </div>
            <div className="enter-rise" style={{ animationDelay: '120ms' }}>
              <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
                <Suspense fallback={null}>
                  <WarningsArchiveSection staffId={id} />
                </Suspense>
              </SectionErrorBoundary>
            </div>
            </>
          )}

          {tab === 'work' && work && <WorkTab work={work} today={today} />}

          {tab === 'people' && canViewCeoScoped && (
            <PeopleTab
              staffId={id}
              name={target.first_name}
              meetings={meetings}
              notes={privateNotes}
              isLead={isAdmin && !isSelf}
              today={today}
            />
          )}

          {tab === 'account' && <AccountTab card={card} isSelf={isSelf} />}

          {tab === 'growth' && canViewCeoScoped && (
            <div className="enter-rise" style={{ animationDelay: '70ms' }}>
              <SectionErrorBoundary fallbackMessage={sectionErrorMessage}>
                <Suspense fallback={<GlassCardSkeleton />}>
                  <SelfDevelopmentSection staffId={id} isAdmin={isAdmin && !isSelf} selectedMonth={month ?? 'all'} />
                </Suspense>
              </SectionErrorBoundary>
            </div>
          )}
        </div>
      </ViewTransition>
    </div>
  );
}

export default async function ProfileDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { month, tab } = await searchParams;
  return <ProfileDetailContent id={id} month={month} tab={tab} hrefBase={`/profile/${id}`} />;
}

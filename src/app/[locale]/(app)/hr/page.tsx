import { getTranslations } from 'next-intl/server';
import { AttendanceView } from '@/components/attendance/attendance-view';
import { EmployeeStatsTable } from '@/components/aurora/employee-stats-table';
import { HrHub, type HrTab } from '@/components/hr/hr-hub';
import { BgVideo } from '@/components/motion/bg-video';
import { Link } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { coreViews } from '@/lib/core-state';
import { loadEmployeeTaskStats } from '@/lib/aurora-dashboard';
import { DAY_RE } from '@/lib/attendance';
import { loadAttendanceRows } from '@/lib/attendance-data';
import { loadHrPeople, loadOnboarding } from '@/lib/hr-data';
import { can, canFor, canSeeFor, ROLES, ROLE_DEPT, type Department } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { CareerRoadmap } from '@/components/hr/career-roadmap';
import { GrowthWorkspace, type GrowthView } from '@/components/hr/growth-workspace';
import { HiringView, LeaveView } from '@/components/hr/leave-hiring';
import { loadLeave, loadVacancies } from '@/lib/hr-leave-data';
import { loadGrowthPlan, loadGrowthTeam } from '@/lib/hr-growth-data';
import { roleLabel } from '@/lib/roles';
import { tashkentDayKey } from '@/lib/time';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DEPTS: Department[] = ['top', 'acad', 'com', 'ops', 'fin', 'hr'];

/**
 * HR hub — all native. Leave and hiring moved off Core on 2026-11-21 (the
 * month-end bonus lives in Finance).
 */
type Tab = HrTab | 'leave' | 'hiring' | 'attendance' | 'roadmap' | 'growth';

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; day?: string; v?: string; person?: string; stage?: string }> }) {
  const { tab: tabParam, day: dayParam, v: viewParam, person: personParam, stage: stageParam } = await searchParams;
  const { profile } = await getAuthState();
  // canFor: the active role plus Section access overrides.
  const isManager = !!profile && canFor(profile, 'hr.manage');
  const leaveReviewer = !!profile && canFor(profile, 'leave.review');
  const hiring = !!profile && canFor(profile, 'hr.hiring');
  const overview = !!profile && can(profile.role, 'company.overview');
  // Xodimlar task foizi: CEO + HR (tasks.monitor); HR CEO/COO qatorlarini ko'rmaydi (owner, 2026-11-23).
  const taskStats = overview || (!!profile && canFor(profile, 'tasks.monitor'));
  // Davomat — CEO, COO and Admin Manager only (SECTION_ROLES.attendance).
  const marksAttendance = !!profile && canSeeFor(profile, 'attendance');

  const allTabs: { k: Tab; n: string }[] = isManager
    ? [
        { k: 'people', n: 'people' },
        { k: 'org', n: 'org' },
        { k: 'roadmap', n: 'roadmap' },
        { k: 'growth', n: 'growth' },
        { k: 'onboarding', n: 'onboarding' },
        { k: 'analytics', n: 'analytics' },
        { k: 'attendance', n: 'attendance' },
        { k: 'leave', n: 'leave' },
        { k: 'hiring', n: 'hiring' },
      ]
    : [
        { k: 'people', n: 'me' },
        { k: 'roadmap', n: 'roadmap' },
        { k: 'growth', n: 'growth' },
        { k: 'leave', n: 'leave' },
        ...(hiring ? [{ k: 'hiring' as const, n: 'hiring' }] : []),
      ];
  // Core's per-person ACL can hide HR; Roadmap · Mind map stays open to
  // everyone (owner, 2026-11-16) and so does asking for leave.
  const hrOpen = !!profile && (await coreViews(profile)).includes('hr');
  const tabs = allTabs
    .filter((t) => t.k !== 'attendance' || marksAttendance)
    .filter((t) => t.k !== 'hiring' || hiring)
    .filter((t) => hrOpen || t.k === 'roadmap' || t.k === 'growth' || t.k === 'leave');
  const tab = (tabs.some((t) => t.k === tabParam) ? tabParam : tabs[0].k) as Tab;
  const today = tashkentDayKey();
  const day = dayParam && DAY_RE.test(dayParam) ? dayParam : today;

  const tStaff = await getTranslations('staff');
  const tp = await getTranslations('pg.hr');
  const tDept = await getTranslations('att.dept');
  const DEPT_LABEL = Object.fromEntries(DEPTS.map((d) => [d, d === 'hr' ? 'HR' : tDept(d)])) as Record<Department, string>;
  const roleLabels = Object.fromEntries(ROLES.map((r) => [r, roleLabel(tStaff, r)]));
  const native = tab === 'people' || tab === 'org' || tab === 'onboarding' || tab === 'analytics';
  const people = !native || !profile ? [] : await loadHrPeople(isManager ? undefined : profile.id);
  const onboarding = !native ? [] : await loadOnboarding(people.map((p) => p.id));
  const attendance = tab === 'attendance' ? await loadAttendanceRows(day) : null;
  const stats = tab === 'analytics' && taskStats ? await loadEmployeeTaskStats({ hideLeadership: !overview }) : null;
  const [myLeave, teamLeave] = tab === 'leave' && profile ? await Promise.all([loadLeave(profile.id), leaveReviewer ? loadLeave() : Promise.resolve(null)]) : [[], null];
  const vacancies = tab === 'hiring' && hiring ? await loadVacancies() : null;

  // HR rivojlanish yo'li (barcha xodimlar) — lavozim pog'onasi + o'z so'rovlari;
  // CEO uchun tasdiqlash navbati.
  const held = profile ? (profile.roles ?? [profile.role]) : [];
  const isCeoHeld = held.includes('ceo');
  const ladder = ROLES.map((r) => ({ role: r as string, dept: ROLE_DEPT[r] as string, label: roleLabels[r] ?? (r as string) }));
  const myRequests = tab === 'roadmap' && profile
    ? await sql<{ role: string; status: string }[]>`select role, status from position_requests where user_id = ${profile.id} and status = 'pending'`.catch(() => [])
    : [];
  const roadmapQueue = tab === 'roadmap' && isCeoHeld
    ? await sql<{ id: string; name: string; role: string }[]>`
        select pr.id, trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as name, pr.role
        from position_requests pr join profiles p on p.id = pr.user_id
        where pr.status = 'pending' order by pr.created_at`.catch(() => [])
    : [];

  // Roadmap · Mind map: o'z rejasi; CEO va HR (growth.viewAll) jamoanikini ham
  // ko'radi, bosqichni faqat CEO (growth.review) tasdiqlaydi.
  const canReview = !!profile && canFor(profile, 'growth.review');
  const canViewTeam = canReview || (!!profile && canFor(profile, 'growth.viewAll'));
  const growthPerson = tab === 'growth' && canViewTeam && personParam && personParam !== profile?.id && /^[0-9a-f-]{36}$/.test(personParam) ? personParam : null;
  const [growthMe, growthViewed, growthTeam] = tab === 'growth' && profile
    ? await Promise.all([
        loadGrowthPlan(profile.id),
        growthPerson ? loadGrowthPlan(growthPerson, true) : Promise.resolve(null),
        canViewTeam ? loadGrowthTeam() : Promise.resolve(null),
      ])
    : [null, null, null];

  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 pt-1 sm:px-7">
        <header className="relative overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px]">
          <BgVideo variant="hero" />
          <div className="relative z-10">
            <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">HR</h1>
            <p className="mt-1 text-sm text-au-muted">
              {isManager ? tp('subManager') : tp('subStaff')}
            </p>
          </div>
        </header>
        <nav aria-label={tp('navAria')} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-1">
            {tabs.map((t) => (
              <Link
                key={t.k}
                href={`?tab=${t.k}`}
                aria-current={t.k === tab ? 'page' : undefined}
                className={cn('inline-flex h-8 items-center rounded-[8px] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors', t.k === tab ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
              >
                {tp(t.n)}
              </Link>
            ))}
          </div>
        </nav>
        {attendance && <AttendanceView key={day} day={day} today={today} initialRows={attendance} />}
        {tab === 'roadmap' && profile && (
          <div className="pb-8">
            <CareerRoadmap
              ladder={ladder}
              deptLabels={DEPT_LABEL}
              held={held}
              requests={myRequests}
              isCeo={isCeoHeld}
              queue={roadmapQueue.map((q) => ({ id: q.id, name: q.name || '—', role: q.role, label: roleLabels[q.role] ?? q.role }))}
            />
          </div>
        )}
        {growthMe && (
          <div className="-mx-4 pb-8 sm:-mx-7">
            <GrowthWorkspace
              key={`${growthViewed?.userId ?? growthMe.userId}`}
              me={growthMe}
              viewed={growthViewed}
              team={growthTeam}
              canReview={canReview}
              initialView={(viewParam === 'mind' ? 'mind' : 'roadmap') as GrowthView}
              initialStage={stageParam ?? null}
              today={today}
            />
          </div>
        )}
        {tab === 'leave' && profile && (
          <div className="pb-8">
            <LeaveView mine={myLeave} team={teamLeave} meId={profile.id} isCeo={overview} today={today} />
          </div>
        )}
        {vacancies && (
          <div className="pb-8">
            <HiringView vacancies={vacancies} deptLabels={DEPT_LABEL} />
          </div>
        )}
        {native && profile && (
          <div className="pb-8">
            <HrHub
              people={people}
              onboarding={onboarding}
              isManager={isManager}
              meId={profile.id}
              today={today}
              tab={tab as HrTab}
              roleLabels={roleLabels}
              deptLabels={DEPT_LABEL}
              analyticsExtra={taskStats ? <EmployeeStatsTable rows={stats} /> : undefined}
              profileLinkIds={people
                .filter(
                  (p) =>
                    p.id !== profile.id &&
                    (can(profile.role, 'company.overview') ||
                      (canFor(profile, 'profiles.viewAll') && ![p.role, ...p.roles].some((r) => r === 'ceo' || r === 'coo'))),
                )
                .map((p) => p.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

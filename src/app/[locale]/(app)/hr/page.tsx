import { getTranslations } from 'next-intl/server';
import { CoreSection } from '@/components/core/core-section';
import { EmployeeStatsTable } from '@/components/aurora/employee-stats-table';
import { HrHub, type HrTab } from '@/components/hr/hr-hub';
import { BgVideo } from '@/components/motion/bg-video';
import { Link } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { loadEmployeeTaskStats } from '@/lib/aurora-dashboard';
import { loadHrPeople, loadOnboarding } from '@/lib/hr-data';
import { can, ROLES, type Department } from '@/lib/permissions';
import { roleLabel } from '@/lib/roles';
import { tashkentDayKey } from '@/lib/time';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DEPT_LABEL: Record<Department, string> = {
  top: 'Rahbariyat',
  acad: 'Akademik',
  com: 'Tijorat',
  ops: 'Operatsiya',
  fin: 'Moliya',
  hr: 'HR',
};

/**
 * HR hub. People, structure, onboarding and analytics are native; leave,
 * hiring and the month-end bonus still run in Core (their data lives in
 * core_state), so they stay one tab away instead of being lost.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const { profile } = await getAuthState();
  const isManager = !!profile && can(profile.role, 'staff.manage');
  const overview = !!profile && can(profile.role, 'company.overview');

  const tabs: { k: HrTab | 'core'; n: string }[] = isManager
    ? [
        { k: 'people', n: 'Xodimlar' },
        { k: 'org', n: 'Tuzilma' },
        { k: 'onboarding', n: 'Onboarding' },
        { k: 'analytics', n: 'Tahlil' },
        { k: 'core', n: 'Ta’til · Ishga olish · Bonus' },
      ]
    : [
        { k: 'people', n: 'Mening profilim' },
        { k: 'core', n: 'Ta’til va davomat' },
      ];
  const tab = (tabs.some((t) => t.k === tabParam) ? tabParam : tabs[0].k) as HrTab | 'core';

  const tStaff = await getTranslations('staff');
  const roleLabels = Object.fromEntries(ROLES.map((r) => [r, roleLabel(tStaff, r)]));
  const people = tab === 'core' || !profile ? [] : await loadHrPeople(isManager ? undefined : profile.id);
  const onboarding = tab === 'core' ? [] : await loadOnboarding(people.map((p) => p.id));
  const stats = tab === 'analytics' && overview ? await loadEmployeeTaskStats() : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 pt-1 sm:px-7">
        <header className="relative overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px]">
          <BgVideo variant="hero" />
          <div className="relative z-10">
            <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">HR</h1>
            <p className="mt-1 text-sm text-au-muted">
              {isManager ? 'Jamoa, tuzilma, yangi xodimlar va 360° profil — barcha bo‘limlar ma’lumoti bir joyda' : 'Profilingiz, onboarding va ta’til so‘rovlari'}
            </p>
          </div>
        </header>
        <nav aria-label="HR bo‘limlari" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-1">
            {tabs.map((t) => (
              <Link
                key={t.k}
                href={`?tab=${t.k}`}
                aria-current={t.k === tab ? 'page' : undefined}
                className={cn('inline-flex h-8 items-center rounded-[8px] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors', t.k === tab ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
              >
                {t.n}
              </Link>
            ))}
          </div>
        </nav>
        {tab !== 'core' && profile && (
          <div className="pb-8">
            <HrHub
              people={people}
              onboarding={onboarding}
              isManager={isManager}
              meId={profile.id}
              today={tashkentDayKey()}
              tab={tab}
              roleLabels={roleLabels}
              deptLabels={DEPT_LABEL}
              analyticsExtra={overview ? <EmployeeStatsTable rows={stats} /> : undefined}
            />
          </div>
        )}
      </div>
      {tab === 'core' && <CoreSection view="hr" navKey="hr" />}
    </div>
  );
}

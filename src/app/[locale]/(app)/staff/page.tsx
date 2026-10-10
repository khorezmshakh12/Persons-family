import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { AddStaffDialog } from '@/components/staff/add-staff-dialog';
import { AdminManagementSection } from '@/components/staff/admin-management-section';
import { StaffConsole, type ConsoleTab } from '@/components/staff/staff-console';
import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';
import { can, ROLES } from '@/lib/permissions';
import { roleLabel } from '@/lib/roles';
import { loadAccountAudit, loadConsoleAccounts } from '@/lib/staff-console-data';
import { BgVideo } from '@/components/motion/bg-video';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TABS: { k: ConsoleTab; n: string }[] = [
  { k: 'accounts', n: 'Hisoblar' },
  { k: 'access', n: 'Kirish huquqlari' },
  { k: 'security', n: 'Xavfsizlik' },
  { k: 'audit', n: 'Jurnal' },
];

/**
 * Staff console — accounts and access (Okta / Google Admin style). People
 * themselves (employment, onboarding, 360° profile) live in HR; this page is
 * about who can sign in and what they can open. The layout above already
 * limits it to staff managers; AdminManagementSection stays CEO-gated.
 */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = (TABS.some((t) => t.k === tabParam) ? tabParam : 'accounts') as ConsoleTab;
  const t = await getTranslations('staff');
  const { user, profile } = await getAuthState();
  const isCeo = profile!.role === 'ceo';

  const [accounts, audit] = await Promise.all([loadConsoleAccounts(isCeo), loadAccountAudit()]);
  const roleLabels = Object.fromEntries(ROLES.map((r) => [r, roleLabel(t, r)]));
  // eslint-disable-next-line react-hooks/purity -- server render: one "now" for every relative time below
  const now = Date.now();

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 pt-1 pb-24 sm:px-7">
      <header className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
        <BgVideo variant="hero" />
        <div className="relative z-10">
          <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-au-muted">Hisoblar, kirish huquqlari va xavfsizlik — kim tizimga kira oladi va nimani ko‘radi</p>
        </div>
        <div className="relative z-10">
          <AddStaffDialog canAssignCeo={can(profile!.role, 'staff.manageProtected')} />
        </div>
      </header>

      <nav aria-label="Xodimlar bo‘limlari" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-1">
          {TABS.map((x) => (
            <Link
              key={x.k}
              href={`?tab=${x.k}`}
              aria-current={x.k === tab ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 items-center rounded-[8px] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors',
                x.k === tab ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink',
              )}
            >
              {x.n}
            </Link>
          ))}
        </div>
      </nav>

      <div key={tab} className="ms-rise flex flex-col gap-5">
        <StaffConsole tab={tab} accounts={accounts} audit={audit} now={now} currentUserId={user!.id} actingRole={profile!.role} roleLabels={roleLabels} />
        {tab === 'security' && (
          <Suspense fallback={<GlassCardSkeleton />}>
            <AdminManagementSection />
          </Suspense>
        )}
      </div>
    </div>
  );
}

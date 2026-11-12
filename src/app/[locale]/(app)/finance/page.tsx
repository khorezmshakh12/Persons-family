import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { FinanceDetailContent } from './[staffId]/page';
import { can, canSeeFor } from '@/lib/permissions';
import { roleLabel } from '@/lib/roles';
import { FinanceTabs } from '@/components/finance/finance-tabs';
import { MonitorView } from '@/components/finance/monitor-view';
import { loadMonitor } from '@/lib/monitor-data';
import { YM_RE } from '@/lib/monitor';
import { tashkentMonthKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; month?: string; incomeYear?: string }>;
}) {
  const tStaff = await getTranslations('staff');
  const { user, profile } = await getAuthState();
  if (!user || !profile) return null; // layout redirects to /login
  const isAdmin = can(profile!.role, 'finance.viewAll');

  if (isAdmin) {
    // Monitor 1:1 (owner, 2026-11-12): `?month=YYYY-MM` (old `?period=` links
    // still land on their month); default — the current Tashkent month.
    const sp = (await searchParams) ?? {};
    const asked = sp.month && YM_RE.test(sp.month) ? sp.month : sp.period && /^\d{4}-\d{2}/.test(sp.period) ? sp.period.slice(0, 7) : null;
    const month = asked ?? tashkentMonthKey();
    const data = await loadMonitor(month);
    const employees = data.employees.map((e) => ({ ...e, role: roleLabel(tStaff, e.role) }));

    return (
      <div className="flex w-full flex-col">
        <FinanceTabs meId={user!.id} payroll accounting={canSeeFor(profile!, 'accounting')} className="mx-3 sm:mx-6" />
        <MonitorView key={month} month={month} employees={employees} transactions={data.transactions} />
      </div>
    );
  }

  // Non-admin: their own pay statement, KPI and Income Roadmap live on the
  // per-staff detail page, rendered here in place.
  return <FinanceDetailContent staffId={user!.id} searchParams={searchParams} />;
}

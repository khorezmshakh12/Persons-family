import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { resolvePeriod } from '@/lib/payroll';
import { FinanceDetailContent } from './[staffId]/page';
import { can, canSeeFor } from '@/lib/permissions';
import { roleLabel } from '@/lib/roles';
import { FinanceTabs } from '@/components/finance/finance-tabs';
import { PayrollV2 } from '@/components/finance/payroll-v2';
import { loadAdvances, loadMyRecentEntries, loadPayHistory, loadPayLines, loadPayRun, loadPayRunLog, loadReimbursements } from '@/lib/pay-run-data';
import { loadCashBoxes } from '@/lib/pay-cash';

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
    // `?period=` is user-supplied — normalised (or replaced with the current
    // Tashkent month) before it reaches a query.
    const period = resolvePeriod((await searchParams)?.period);
    const [lines, run, log, advances, history, recent, boxes, reimbursements] = await Promise.all([
      loadPayLines(period),
      loadPayRun(period),
      loadPayRunLog(period),
      loadAdvances(),
      loadPayHistory(period),
      can(profile!.role, 'finance.manage') ? loadMyRecentEntries(user!.id) : [],
      loadCashBoxes().catch(() => []),
      loadReimbursements().catch(() => []),
    ]);
    const roleNames = Object.fromEntries([...new Set(lines.map((l) => l.role))].map((r) => [r, roleLabel(tStaff, r)]));

    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-3 pt-1 pb-10 sm:px-6">
        <FinanceTabs meId={user!.id} payroll accounting={canSeeFor(profile!, 'accounting')} />
        <PayrollV2 period={period} run={run} lines={lines} log={log} advances={advances} history={history} roleNames={roleNames} recent={recent} boxes={boxes} reimbursements={reimbursements} />
      </div>
    );
  }

  // Non-admin: their own pay statement, KPI and Income Roadmap live on the
  // per-staff detail page, rendered here in place.
  return <FinanceDetailContent staffId={user!.id} searchParams={searchParams} />;
}

import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { resolvePeriod } from '@/lib/payroll';
import { FinanceDetailContent } from './[staffId]/page';
import { can, canSeeFor } from '@/lib/permissions';
import { roleLabel } from '@/lib/roles';
import { FinanceTabs } from '@/components/finance/finance-tabs';
import { BgVideo } from '@/components/motion/bg-video';
import { PayRunConsole } from '@/components/finance/pay-run-console';
import { loadAdvances, loadPayHistory, loadPayLines, loadPayRun, loadPayRunLog } from '@/lib/pay-run-data';

export const dynamic = 'force-dynamic';

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const t = await getTranslations('finance');
  const tStaff = await getTranslations('staff');
  const { user, profile } = await getAuthState();
  const isAdmin = can(profile!.role, 'finance.viewAll');

  if (isAdmin) {
    // `?period=` is user-supplied — normalised (or replaced with the current
    // Tashkent month) before it reaches a query.
    const period = resolvePeriod((await searchParams)?.period);
    const [lines, run, log, advances, history] = await Promise.all([
      loadPayLines(period),
      loadPayRun(period),
      loadPayRunLog(period),
      loadAdvances(),
      loadPayHistory(period),
    ]);
    const roleNames = Object.fromEntries([...new Set(lines.map((l) => l.role))].map((r) => [r, roleLabel(tStaff, r)]));

    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 pt-1 pb-8 sm:px-7">
        <div className="relative flex flex-col gap-1 overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
          <BgVideo variant="hero" />
          <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">{t('title')}</h1>
          <p className="text-au-muted">Oylik jarayoni: hisoblash → tekshirish → tasdiqlash → to‘lov. Har bir summaning manbasi ko‘rinadi.</p>
        </div>

        {canSeeFor(profile!, 'accounting') && <FinanceTabs className="self-start" />}

        <PayRunConsole period={period} run={run} lines={lines} log={log} advances={advances} history={history} roleNames={roleNames} />
      </div>
    );
  }

  // Non-admin: their own pay statement, KPI and Income Roadmap live on the
  // per-staff detail page, rendered here in place.
  return <FinanceDetailContent staffId={user!.id} />;
}

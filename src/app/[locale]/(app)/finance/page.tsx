import { getLocale, getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { PayrollSection } from '@/components/finance/payroll-section';
import { getPayrollSummary, resolvePeriod } from '@/lib/payroll';
import { FinanceDetailContent } from './[staffId]/page';
import { can, canSeeFor } from '@/lib/permissions';
import { FinanceTabs } from '@/components/finance/finance-tabs';
import { BgVideo } from '@/components/motion/bg-video';

export const dynamic = 'force-dynamic';

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const t = await getTranslations('finance');
  const locale = await getLocale();
  const { user, profile } = await getAuthState();
  const isAdmin = can(profile!.role, 'finance.viewAll');

  if (isAdmin) {
    // `?period=` is user-supplied — normalised (or replaced with the current
    // Tashkent month) before it reaches a query.
    const period = resolvePeriod((await searchParams)?.period);
    // One table: every active employee's salary, paid and remaining for the
    // month — each name opens that person's ledger. (The separate staff
    // list that used to follow it repeated the same people.)
    const payroll = await getPayrollSummary(period);

    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
        <div className="flex flex-col gap-1 relative overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
          <BgVideo variant="hero" />
          <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">
            {t('title')}
          </h1>
          <p className="text-au-muted">{t('adminSubtitle')}</p>
        </div>

        {canSeeFor(profile!, 'accounting') && <FinanceTabs className="self-start" />}

        <PayrollSection summary={payroll} locale={locale} />

      </div>
    );
  }

  // Non-admin: their own ledger + KPI + Income Roadmap all live together on
  // the per-staff detail page now, so this list page renders it in place
  // (used to redirect() to /finance/[own-id] — see the comment on
  // ProfileDetailContent in profile/[id]/page.tsx for why that broke).
  return <FinanceDetailContent staffId={user!.id} />;
}

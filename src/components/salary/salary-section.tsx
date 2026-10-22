import { getTranslations } from 'next-intl/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { ManageStaffFinanceDialog } from '@/components/finance/manage-staff-finance-dialog';
import { FinanceEntriesList, type FinanceEntry } from '@/components/finance/finance-entries-list';
import { BonusesPunishmentsCard } from '@/components/profile/bonuses-punishments-card';
import { KpiSection } from '@/components/kpi/kpi-section';
import { SelfDevelopmentSection } from '@/components/profile/self-development-section';
import { SalaryMissionsList } from './salary-missions-list';
import { SalaryTotal } from './salary-total';
import type { PayLine } from '@/lib/pay-run';

/** Consolidates everything money/performance-related for one employee under
 * a single "Salary" section on /finance/[id]: the Salary ledger itself
 * (moved in from what used to be the whole page), Bonuses/Penalties and
 * Self Development (both reused as-is from Profile, shown in both places
 * per the CEO's own call), KPI, a read-only archive of past approved Mission bonuses, and a Total
 * that sums all of the above. */
export async function SalarySection({
  staffId,
  isSelf,
  isCeo,
  isAdmin,
  entries,
  month,
  line,
}: {
  staffId: string;
  isSelf: boolean;
  isCeo: boolean;
  isAdmin: boolean;
  entries: FinanceEntry[];
  /** YYYY-MM the page is showing. */
  month: string;
  /** The month's pay line from the engine — the only source of its totals. */
  line: PayLine | null;
}) {
  const t = await getTranslations('salary');
  // This month only, from the pay engine: everything on top of the base
  // (KPI, bonus, rag‘bat, jarima, self-development, carry, advance shares)
  // and what was paid out for this month. Payments are never added to pay.
  const adjustments = line ? line.payable - line.base : 0;
  const paid = line?.paid ?? 0;

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-6 p-6')}>
      <h2 className="font-heading text-lg font-semibold text-au-ink">
        {t('title')}
      </h2>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-au-ink">{t('salaryLedger')}</h3>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="text-au-muted">
                {t('ledgerAdjustments')}{' '}
                <b className={cn('tabular-nums', adjustments > 0 ? 'text-au-ok' : adjustments < 0 ? 'text-au-bad' : 'text-au-ink')}>
                  {adjustments > 0 ? '+' : ''}
                  {formatUZS(adjustments)}
                </b>
              </span>
              <span className="text-au-muted">
                {t('ledgerPaid')} <b className="tabular-nums text-au-ink">{formatUZS(paid)}</b>
              </span>
            </div>
          </div>
          {isAdmin && <ManageStaffFinanceDialog staffId={staffId} month={month} />}
        </div>
        <FinanceEntriesList entries={entries} isAdmin={isAdmin} />
      </div>

      <div className="border-t border-au-line pt-4">
        <BonusesPunishmentsCard staffId={staffId} canManage={isAdmin} month={month} />
      </div>

      <div className="border-t border-au-line pt-4">
        <KpiSection staffId={staffId} canManage={isCeo && !isSelf} month={`${month}-01`} />
      </div>

      <div className="border-t border-au-line pt-4">
        <SelfDevelopmentSection staffId={staffId} isAdmin={isAdmin && !isSelf} selectedMonth={`${month}-01`} />
      </div>

      <div className="border-t border-au-line pt-4">
        <SalaryMissionsList staffId={staffId} month={month} />
      </div>

      <div className="border-t border-au-line pt-4">
        <SalaryTotal staffId={staffId} isCeo={isCeo && !isSelf} month={month} payable={line?.payable ?? 0} />
      </div>
    </div>
  );
}

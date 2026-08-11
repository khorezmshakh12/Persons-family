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

/** Consolidates everything money/performance-related for one employee under
 * a single "Salary" section on /finance/[id]: the Salary ledger itself
 * (moved in from what used to be the whole page), Bonuses/Penalties and
 * Self Development (both reused as-is from Profile, shown in both places
 * per the CEO's own call), KPI, a read-only Missions summary, and a Total
 * that sums all of the above. */
export async function SalarySection({
  staffId,
  isSelf,
  isCeo,
  isAdmin,
  entries,
  net,
}: {
  staffId: string;
  isSelf: boolean;
  isCeo: boolean;
  isAdmin: boolean;
  entries: FinanceEntry[];
  net: number;
}) {
  const t = await getTranslations('salary');

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-6 p-6')}>
      <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {t('title')}
      </h2>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium text-white/80">{t('salaryLedger')}</h3>
            <span
              className={cn('text-lg font-bold tabular-nums', net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-white/70')}
            >
              {net >= 0 ? '+' : ''}
              {formatUZS(net)}
            </span>
          </div>
          {isAdmin && <ManageStaffFinanceDialog staffId={staffId} />}
        </div>
        <FinanceEntriesList entries={entries} isAdmin={isAdmin} />
      </div>

      <div className="border-t border-white/10 pt-4">
        <BonusesPunishmentsCard staffId={staffId} canManage={isAdmin} />
      </div>

      <div className="border-t border-white/10 pt-4">
        <KpiSection staffId={staffId} canManage={isCeo && !isSelf} />
      </div>

      <div className="border-t border-white/10 pt-4">
        <SelfDevelopmentSection staffId={staffId} isAdmin={isAdmin && !isSelf} isCeo={isCeo && !isSelf} selectedMonth="all" />
      </div>

      <div className="border-t border-white/10 pt-4">
        <SalaryMissionsList staffId={staffId} />
      </div>

      <div className="border-t border-white/10 pt-4">
        <SalaryTotal staffId={staffId} isCeo={isCeo && !isSelf} />
      </div>
    </div>
  );
}

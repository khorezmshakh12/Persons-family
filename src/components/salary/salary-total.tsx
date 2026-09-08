import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { formatUZS } from '@/lib/format-currency';
import { getNetEarningEntries, netEarnings } from '@/lib/finance-net';
import { cn } from '@/lib/utils';
import { SalaryNoteForm } from './salary-note-form';

/** Sums every cash source that feeds a staff member's take-home total — the
 * Salary ledger, Bonus/Penalty entries, any Self Development bonus, and
 * approved Mission bonuses. The sum itself lives in lib/finance-net.ts so
 * the dashboard's Finance stat card (which links straight here) reports the
 * exact same number; it used to count only the Salary ledger. Fetches its
 * own data rather than taking it as props, matching every other section on
 * this page (KpiSection, BonusesPunishmentsCard, SelfDevelopmentSection all
 * fetch independently too). */
export async function SalaryTotal({ staffId, isCeo }: { staffId: string; isCeo: boolean }) {
  const t = await getTranslations('salary');

  const [entries, [note]] = await Promise.all([
    getNetEarningEntries(staffId),
    sql<{ comment: string }[]>`select comment from staff_salary_notes where staff_id = ${staffId}`,
  ]);

  const total = netEarnings(entries);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/20 bg-white/10 p-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-white/70">{t('total')}</span>
        <span
          className={cn(
            'text-3xl font-bold tabular-nums',
            total > 0 ? 'text-emerald-400' : total < 0 ? 'text-red-400' : 'text-white/70',
          )}
        >
          {total >= 0 ? '+' : ''}
          {formatUZS(total)}
        </span>
      </div>
      <SalaryNoteForm staffId={staffId} currentComment={note?.comment ?? ''} isCeo={isCeo} />
    </div>
  );
}

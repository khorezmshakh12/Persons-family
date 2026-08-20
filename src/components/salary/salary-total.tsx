import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { formatUZS } from '@/lib/format-currency';
import { cn } from '@/lib/utils';
import { SalaryNoteForm } from './salary-note-form';

/** Independently sums every cash source that feeds a staff member's
 * take-home total — the Salary ledger, Bonus/Penalty entries, any
 * Self Development bonus, and approved Mission bonuses. Fetches its own
 * data rather than taking it as props, matching every other section on
 * this page (KpiSection, BonusesPunishmentsCard, SelfDevelopmentSection all
 * fetch independently too). */
export async function SalaryTotal({ staffId, isCeo }: { staffId: string; isCeo: boolean }) {
  const t = await getTranslations('salary');

  const [financeEntries, performanceEntries, selfDev, missions, [note]] = await Promise.all([
    sql<{ amount: number }[]>`select amount from finance_entries where staff_id = ${staffId}`,
    sql<{ entry_type: string; amount: number }[]>`
      select entry_type, amount from performance_entries where staff_id = ${staffId}
    `,
    sql<{ bonus_amount: number | null }[]>`select bonus_amount from self_development where user_id = ${staffId}`,
    sql<{ bonus_amount: number | null }[]>`
      select bonus_amount from missions where staff_id = ${staffId} and status = 'approved'
    `,
    sql<{ comment: string }[]>`select comment from staff_salary_notes where staff_id = ${staffId}`,
  ]);

  const financeSum = financeEntries.reduce((sum, e) => sum + e.amount, 0);
  const performanceSum = performanceEntries.reduce(
    (sum, e) => sum + (e.entry_type === 'bonus' ? e.amount : -e.amount),
    0,
  );
  const selfDevSum = selfDev.reduce((sum, s) => sum + (s.bonus_amount ?? 0), 0);
  const missionsSum = missions.reduce((sum, m) => sum + (m.bonus_amount ?? 0), 0);
  const total = financeSum + performanceSum + selfDevSum + missionsSum;

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

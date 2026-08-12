import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();

  const [{ data: financeEntries }, { data: performanceEntries }, { data: selfDev }, { data: missions }, { data: note }] =
    await Promise.all([
      supabase.from('finance_entries').select('amount').eq('staff_id', staffId),
      supabase.from('performance_entries').select('entry_type, amount').eq('staff_id', staffId),
      supabase.from('self_development').select('bonus_amount').eq('user_id', staffId),
      supabase.from('missions').select('bonus_amount').eq('staff_id', staffId).eq('status', 'approved'),
      supabase.from('staff_salary_notes').select('comment').eq('staff_id', staffId).maybeSingle(),
    ]);

  const financeSum = (financeEntries ?? []).reduce((sum, e) => sum + e.amount, 0);
  const performanceSum = (performanceEntries ?? []).reduce(
    (sum, e) => sum + (e.entry_type === 'bonus' ? e.amount : -e.amount),
    0,
  );
  const selfDevSum = (selfDev ?? []).reduce((sum, s) => sum + (s.bonus_amount ?? 0), 0);
  const missionsSum = (missions ?? []).reduce((sum, m) => sum + (m.bonus_amount ?? 0), 0);
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

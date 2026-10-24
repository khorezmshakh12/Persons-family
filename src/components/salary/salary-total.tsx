import { sql } from '@/lib/db/client';
import { formatUZS } from '@/lib/format-currency';
import { monthLabel } from '@/lib/pay-run';
import { cn } from '@/lib/utils';
import { SalaryNoteForm } from './salary-note-form';

/** The selected month's computed pay (pay engine payable: base + KPI +
 * bonuses − jarima ± carry/advance shares) — only that month, never a sum
 * across months (finance audit 2026-10-22: the old all-time total sat under
 * the month picker and read as this month's). */
export async function SalaryTotal({ staffId, isCeo, month, payable }: { staffId: string; isCeo: boolean; month: string; payable: number }) {
  const [note] = await sql<{ comment: string }[]>`select comment from staff_salary_notes where staff_id = ${staffId}`;
  const total = payable;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-au-line bg-au-card p-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-au-muted">{monthLabel(`${month}-01`)} — hisoblangan oylik</span>
        <span
          className={cn(
            'text-3xl font-bold tabular-nums',
            total > 0 ? 'text-emerald-600' : total < 0 ? 'text-red-600' : 'text-au-muted',
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

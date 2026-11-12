'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { addFinanceEntryAction, deleteFinanceEntryAction } from '@/lib/actions/finance';
import { YM_RE, getPreviousMonth, periodToYm, ymToPeriod, type MonOp } from '@/lib/monitor';

// Finance › Moliya (Monitor 1:1). Yozuvlar mavjud action'lar orqali
// (addFinanceEntryAction / deleteFinanceEntryAction) — Telegram xabari,
// pay_run_log va kassa sinxronizatsiyasi avvalgidek. Faqat CEO (finance.manage).

type Result = { error: string } | { ok: true; clearedRequest?: boolean };

const KIND: Record<MonOp, 'advance' | 'salary' | 'adjustment' | 'penalty'> = {
  AVANS: 'advance',
  SALARY_PAY: 'salary',
  BONUS: 'adjustment',
  PENALTY: 'penalty',
};

async function requireFinanceManager(): Promise<{ id: string } | { error: string }> {
  try {
    const { user } = await requireCap('finance.manage');
    return { id: user.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

const revalidate = () => {
  revalidatePath('/[locale]/finance', 'page');
  revalidatePath('/[locale]/finance/[staffId]', 'page');
};

/** Monitor: a month without its own salary row uses the nearest earlier one.
 * Before money is written into such a month, that salary is stored for it,
 * so the staff page and accounting (which read salary_months only) agree. */
async function freezeSalary(staffId: string, ym: string, by: string) {
  await sql`
    insert into salary_months (staff_id, period, gross_amount, set_by)
    select ${staffId}, ${ymToPeriod(ym)}, s.gross_amount, ${by} from salary_months s
    where s.staff_id = ${staffId} and s.period < ${ymToPeriod(ym)}
    order by s.period desc limit 1
    on conflict (staff_id, period) do nothing`;
}

const opSchema = z.object({
  staffId: z.string().uuid(),
  type: z.enum(['AVANS', 'SALARY_PAY', 'BONUS', 'PENALTY']),
  amount: z.number().int().positive().max(1e11),
  month: z.string().regex(YM_RE),
  reason: z.string().trim(),
});

/** «Tasdiqlash va hisobga yozish» — Avans / Oylik to'lov / Bonus / Jarima. */
export async function monitorAddOperationAction(input: z.input<typeof opSchema>): Promise<Result> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  const p = opSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  if (v.reason.length < 3) return { error: 'reasonRequired' };
  try {
    await freezeSalary(v.staffId, v.month, g.id);
  } catch (e) {
    console.error('[monitor] freeze salary failed', e);
  }
  const fd = new FormData();
  fd.set('staffId', v.staffId);
  fd.set('title', v.reason.slice(0, 200));
  fd.set('amount', String(v.amount));
  fd.set('kind', KIND[v.type]);
  fd.set('period', ymToPeriod(v.month));
  const res = await addFinanceEntryAction(undefined, fd);
  if (res?.error) return { error: res.error };

  let clearedRequest = false;
  if (v.type === 'AVANS') {
    try {
      const a = await sql`delete from payroll_avans_flags where staff_id = ${v.staffId} and period = ${ymToPeriod(v.month)}`;
      // The staff member's own pending request is settled by this advance.
      const b = await sql`
        update advance_requests set status = 'approved', decided_by = ${g.id}, decided_at = now(),
          finance_entry_id = ${res?.entryId ?? null}, period = ${ymToPeriod(v.month)},
          decision_note = coalesce(decision_note, ${v.reason.slice(0, 200)})
        where staff_id = ${v.staffId} and status = 'pending'`;
      clearedRequest = a.count + b.count > 0;
    } catch (e) {
      console.error('[monitor] clear request failed', e);
    }
  }
  revalidate();
  return { ok: true, clearedRequest };
}

/** Drawer: «O'chirish» on a ledger row. */
export async function monitorDeleteEntryAction(entryId: string): Promise<Result> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(entryId).success) return { error: 'invalidInput' };
  const fd = new FormData();
  fd.set('entryId', entryId);
  const res = await deleteFinanceEntryAction(undefined, fd);
  if (res?.error) return { error: res.error };
  revalidate();
  return { ok: true };
}

/** «Avans so'raldi» belgisi (oy bo'yicha). Returns the new state. */
export async function monitorToggleRequestAction(staffId: string, month: string): Promise<{ error: string } | { ok: true; flagged: boolean }> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(staffId).success || !YM_RE.test(month)) return { error: 'invalidInput' };
  const per = ymToPeriod(month);
  try {
    const del = await sql`delete from payroll_avans_flags where staff_id = ${staffId} and period = ${per}`;
    if (del.count > 0) {
      revalidate();
      return { ok: true, flagged: false };
    }
    await sql`insert into payroll_avans_flags (staff_id, period, created_by) values (${staffId}, ${per}, ${g.id}) on conflict do nothing`;
    revalidate();
    return { ok: true, flagged: true };
  } catch (e) {
    console.error('[monitor] toggle request failed', e);
    return { error: 'updateFailed' };
  }
}

const salariesSchema = z.object({
  month: z.string().regex(YM_RE),
  rows: z.array(z.object({ staffId: z.string().uuid(), amount: z.number().int().positive().max(1e11) })).max(500),
});

/** CEO — Oylik maoshlarni belgilash. Like Monitor's setEmployeeMonthlySalary,
 * the month before is frozen first so its history never shifts. */
export async function monitorSetSalariesAction(input: z.input<typeof salariesSchema>): Promise<Result> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  const p = salariesSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { month, rows } = p.data;
  const per = ymToPeriod(month);
  const prev = getPreviousMonth(month);
  try {
    await sql.begin(async (tx) => {
      for (const r of rows) {
        await tx`
          insert into salary_months (staff_id, period, gross_amount, set_by)
          select ${r.staffId}, ${ymToPeriod(prev)}, s.gross_amount, ${g.id} from salary_months s
          where s.staff_id = ${r.staffId} and s.period < ${ymToPeriod(prev)}
          order by s.period desc limit 1
          on conflict (staff_id, period) do nothing`;
        await tx`
          insert into salary_months (staff_id, period, gross_amount, set_by)
          values (${r.staffId}, ${per}, ${r.amount}, ${g.id})
          on conflict (staff_id, period) do update set gross_amount = excluded.gross_amount, set_by = excluded.set_by, set_at = now()`;
      }
    });
  } catch (e) {
    console.error('[monitor] set salaries failed', e);
    return { error: e instanceof Error && /period_locked/.test(e.message) ? 'periodLocked' : 'updateFailed' };
  }
  logSystemAction('finance.salary_set', `Monitor: ${rows.length} salaries set for ${periodToYm(per)}`);
  revalidate();
  return { ok: true };
}

import 'server-only';
import { sql } from '@/lib/db/client';
import { startOfTashkentMonthKey } from '@/lib/time';

/**
 * Payroll = the CEO's monthly salary plan (`salary_months`) reconciled
 * against what was actually paid (`finance_entries` rows tagged
 * `kind in ('salary','advance')` for that month). See the
 * 20260908130000_salary_payroll migration for the model.
 *
 * `period` everywhere here is a 'YYYY-MM-01' string (Asia/Tashkent).
 */

export type PayrollRow = {
  staffId: string;
  name: string;
  role: string;
  gross: number;
  paid: number;
  remaining: number;
};

export type PayrollSummary = {
  period: string;
  rows: PayrollRow[];
  totals: { gross: number; paid: number; remaining: number };
};

/** Normalise a user-supplied `?period=` into a valid 'YYYY-MM-01' key,
 * falling back to the current Tashkent month for anything malformed or
 * out of a sane range. */
export function resolvePeriod(raw?: string | null): string {
  const current = startOfTashkentMonthKey();
  if (!raw) return current;
  const m = /^(\d{4})-(\d{2})(?:-01)?$/.exec(raw.trim());
  if (!m) return current;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2020 || year > 2100) return current;
  return `${m[1]}-${m[2]}-01`;
}

/** Shift a 'YYYY-MM-01' key by whole months. */
export function shiftPeriod(period: string, months: number): string {
  const [y, mo] = period.split('-').map(Number);
  const total = y * 12 + (mo - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/** Whole-team payroll for one month — every active staff member, their
 * planned gross, what has been paid to them this month, and the shortfall.
 * `totals.remaining` is the payroll the CEO still owes for the month.
 * `amount` columns come back as JS numbers — db/client.ts parses `numeric`. */
export async function getPayrollSummary(period: string): Promise<PayrollSummary> {
  const rows = await sql<
    { staff_id: string; first_name: string; last_name: string; role: string; gross: number; paid: number }[]
  >`
    select
      p.id as staff_id,
      p.first_name,
      p.last_name,
      p.role,
      coalesce(sm.gross_amount, 0) as gross,
      coalesce((
        select sum(fe.amount)
        from finance_entries fe
        where fe.staff_id = p.id
          and fe.period = ${period}
          and fe.kind in ('salary', 'advance')
      ), 0) as paid
    from profiles p
    left join salary_months sm on sm.staff_id = p.id and sm.period = ${period}
    where p.is_active = true
    order by p.first_name asc
  `;

  const list: PayrollRow[] = rows.map((r) => ({
    staffId: r.staff_id,
    name: `${r.first_name} ${r.last_name}`,
    role: r.role,
    gross: r.gross,
    paid: r.paid,
    remaining: r.gross - r.paid,
  }));

  return {
    period,
    rows: list,
    totals: {
      gross: list.reduce((s, r) => s + r.gross, 0),
      paid: list.reduce((s, r) => s + r.paid, 0),
      remaining: list.reduce((s, r) => s + r.remaining, 0),
    },
  };
}

export type StaffPayroll = {
  period: string;
  gross: number;
  paid: number;
  remaining: number;
  entries: { id: string; title: string; amount: number; kind: string; created_at: string }[];
};

/** One staff member's payroll for a month — for the profile page. */
export async function getStaffPayroll(staffId: string, period: string): Promise<StaffPayroll> {
  const [plan] = await sql<{ gross: number }[]>`
    select coalesce(gross_amount, 0) as gross
    from salary_months where staff_id = ${staffId} and period = ${period}
  `;
  const entries = await sql<
    { id: string; title: string; amount: number; kind: string; created_at: string }[]
  >`
    select id, title, amount, kind, created_at
    from finance_entries
    where staff_id = ${staffId} and period = ${period}
    order by created_at desc
  `;
  const gross = plan?.gross ?? 0;
  const paid = entries
    .filter((e) => e.kind === 'salary' || e.kind === 'advance')
    .reduce((s, e) => s + e.amount, 0);
  return { period, gross, paid, remaining: gross - paid, entries };
}

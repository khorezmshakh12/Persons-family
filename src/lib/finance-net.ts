import 'server-only';
import { sql } from '@/lib/db/client';
import type { DatedAmount } from '@/lib/dashboard-stats';
import { startOfTashkentMonthKey } from '@/lib/time';

/**
 * THE definition of a staff member's net earnings, in one place — what they
 * EARNED, not what was paid out. The Salary section on /finance/[staffId] and
 * the dashboard's Finance card both call this, so they cannot disagree.
 *
 *   1. salary_months        — the planned base salary of each month (up to
 *                             the current one).
 *   2. finance_entries      — every non-payment row: bonus / tuzatish, KPI,
 *                             jarima, correction. `amount` is already signed.
 *   3. performance_entries  — bonus (+) / penalty (−); `amount` is unsigned,
 *                             the sign lives in `entry_type`.
 *   4. self_development     — the CEO's monthly review bonus.
 *   5. missions             — bonus on an *approved* mission only.
 *
 * Payments (finance_entries kind 'salary' / 'advance') are NOT earnings: the
 * pay run pays out base + bonuses − deductions, so adding the payment on top
 * of its parts counted every bonus twice (finance audit 2026-10-10). A
 * payment only stands in for the base salary in a month that has no
 * salary_months row — the hand-kept ledger from before structured payroll.
 *
 * Every row comes back as a dated, signed movement so the same list can be
 * summed for a headline and bucketed into a time series without the two
 * being able to disagree.
 *
 * `numeric` columns arrive as JS numbers (lib/db/client.ts parses them) — no
 * `::float8` cast belongs in any of these queries.
 */
export type NetEarningEntry = DatedAmount;

export async function getNetEarningEntries(staffId: string): Promise<NetEarningEntry[]> {
  const current = startOfTashkentMonthKey();
  const [salaries, finance, performance, selfDev, missions] = await Promise.all([
    sql<{ period: string; gross: number }[]>`
      select period::text as period, gross_amount as gross from salary_months
      where staff_id = ${staffId} and period <= ${current} and gross_amount > 0
    `,
    // `month` is the row's payroll month: its period, or — for the old
    // period-less rows — the Tashkent month it was written in.
    sql<{ amount: number; kind: string; created_at: string | null; month: string }[]>`
      select amount, kind, created_at,
        coalesce(period, date_trunc('month', created_at at time zone 'Asia/Tashkent')::date)::text as month
      from finance_entries where staff_id = ${staffId}
        -- A carry recovers last month's overpayment; it is not a cut in pay.
        and source <> 'carry'
    `,
    sql<{ entry_type: string; amount: number; created_at: string | null }[]>`
      select entry_type, amount, created_at from performance_entries where staff_id = ${staffId}
    `,
    // `month` is the review's own calendar month (a date) — the right instant
    // to place the bonus on, and the only date this table carries.
    sql<{ bonus_amount: number | null; month: string | null }[]>`
      select bonus_amount, month from self_development
      where user_id = ${staffId} and bonus_amount is not null
    `,
    // approved_at can be null on rows approved before that column was
    // written; created_at keeps such a bonus on the timeline instead of
    // dropping it out of the total entirely.
    sql<{ bonus_amount: number | null; approved_at: string | null; created_at: string | null }[]>`
      select bonus_amount, approved_at, created_at from missions
      where staff_id = ${staffId} and status = 'approved' and bonus_amount is not null
    `,
  ]);

  const planned = new Set(salaries.map((s) => s.period.slice(0, 10)));
  const isPayment = (kind: string) => kind === 'salary' || kind === 'advance';

  return [
    ...salaries.map((s) => ({ amount: s.gross, at: s.period.slice(0, 10) })),
    ...finance
      .filter((row) => !isPayment(row.kind) || !planned.has(row.month.slice(0, 10)))
      .map((row) => ({ amount: row.amount, at: row.created_at })),
    ...performance.map((row) => ({
      amount: row.entry_type === 'bonus' ? row.amount : -row.amount,
      at: row.created_at,
    })),
    ...selfDev.map((row) => ({ amount: row.bonus_amount ?? 0, at: row.month })),
    ...missions.map((row) => ({
      amount: row.bonus_amount ?? 0,
      at: row.approved_at ?? row.created_at,
    })),
  ];
}

/** Net of every movement. Rounded once, at the end — the same rounding the
 * cumulative series applies per bucket, so the headline equals the series'
 * last point. */
export function netEarnings(entries: NetEarningEntry[]): number {
  return Math.round(entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
}

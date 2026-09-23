import 'server-only';
import { sql } from '@/lib/db/client';
import type { DatedAmount } from '@/lib/dashboard-stats';

/**
 * THE definition of a staff member's net earnings, in one place.
 *
 * Four cash sources feed a person's take-home total, and the Salary section
 * on /finance/[staffId] has always summed all four. The dashboard's Finance
 * stat card summed only the first one, so the card and the page it links to
 * showed two different numbers for the same thing. Both now call this.
 *
 *   1. finance_entries      — the salary ledger; `amount` is already signed.
 *   2. performance_entries  — bonus (+) / penalty (−); `amount` is unsigned,
 *                             the sign lives in `entry_type`.
 *   3. self_development     — the CEO's monthly review bonus.
 *   4. missions             — bonus on an *approved* mission only.
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
  const [finance, performance, selfDev, missions] = await Promise.all([
    sql<{ amount: number; created_at: string | null }[]>`
      select amount, created_at from finance_entries where staff_id = ${staffId}
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

  return [
    ...finance.map((row) => ({ amount: row.amount, at: row.created_at })),
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

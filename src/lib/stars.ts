import 'server-only';
import { sql } from '@/lib/db/client';

/**
 * Star balances are never stored as a column — they are the running sum of
 * `star_transactions.delta` for a user (see the upgrade migration). This is
 * the one place that sum lives so callers can't drift on how a negative
 * delta (a CEO deduction, a Market purchase) is folded in.
 */
export async function getStarBalance(userId: string): Promise<number> {
  const [row] = await sql<{ balance: number }[]>`
    select coalesce(sum(delta), 0)::int as balance
    from star_transactions
    where user_id = ${userId}
  `;
  return row?.balance ?? 0;
}

/** Batched balances for a list of users — `{ [userId]: balance }`, missing
 * users default to 0 at the call site. */
export async function getStarBalances(userIds: string[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  const rows = await sql<{ user_id: string; balance: number }[]>`
    select user_id, coalesce(sum(delta), 0)::int as balance
    from star_transactions
    where user_id in ${sql(userIds)}
    group by user_id
  `;
  return Object.fromEntries(rows.map((r) => [r.user_id, r.balance]));
}

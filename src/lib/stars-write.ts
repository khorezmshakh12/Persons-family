import 'server-only';
import type { Sql, TransactionSql } from 'postgres';
import { sql } from '@/lib/db/client';
import { revokeUserSessions } from '@/lib/gcp/session';

/** A balance at or below this locks the account out — see
 * `freezeIfBalanceCritical` below. */
export const STAR_FREEZE_THRESHOLD = -20;

/**
 * `star_transactions` is append-only — a balance is never stored, it is
 * `sum(delta)` (see getStarBalance in ./stars.ts). Every write therefore has
 * to go through one shape, or the ledger drifts: this is that shape.
 *
 * Deliberately NOT a Server Action — it is the low-level insert the actions
 * (CEO award/deduct, Market purchase/refund) and the self-development
 * evaluation flow all call, several of them from inside a `sql.begin`
 * transaction where the stars row must commit or roll back together with
 * whatever else that transaction is writing.
 */

/** Mirrors the CHECK constraint on star_transactions.source_type. */
export type StarSourceType =
  | 'self_development'
  | 'task'
  | 'manual'
  | 'purchase'
  | 'refund'
  | 'penalty';

// The `sql` client is created with a custom `types` option, so its type
// parameter is not the bare `{}` default — inferring it here keeps this
// helper assignable from both the shared client and any `tx` handed out by
// `sql.begin` without hardcoding (and drifting from) that option.
type SqlTypes = typeof sql extends Sql<infer T> ? T : never;

/** Either the shared client or a `sql.begin` transaction handle. */
export type StarLedgerDb = Sql<SqlTypes> | TransactionSql<SqlTypes>;

export type StarTransactionInput = {
  userId: string;
  /** May be negative — a CEO deduction or a Market purchase. Never 0. */
  delta: number;
  reason?: string | null;
  sourceType: StarSourceType;
  /** self_development.id / tasks.id / market_orders.id, per sourceType. */
  sourceId?: string | null;
  /** The CEO who caused it; null when a cron/system flow did. */
  createdBy?: string | null;
};

/**
 * Locks the account out (mirrors a manual CEO deactivation — see
 * `getAuthState()` in lib/auth/session.ts, which is what actually enforces
 * `is_active` on every page) once a balance is critical, and stamps
 * `frozen_reason` so the login page can show a message specific to this
 * (vs. one a CEO deactivated by hand, which never sets it). Never
 * un-freezes on its own even if a later award brings the balance back up —
 * same as a manual deactivation, restoring access is a deliberate decision
 * for the CEO to make from the Staff table, not something a subsequent
 * transaction should silently reverse.
 *
 * Runs on the same `db` handle the ledger insert used, so within a
 * `sql.begin` transaction the freeze commits or rolls back with the
 * transaction it belongs to instead of racing a concurrent read of the
 * balance it just computed.
 */
async function freezeIfBalanceCritical(db: StarLedgerDb, userId: string): Promise<void> {
  const [row] = await db<{ balance: number; is_active: boolean }[]>`
    select
      (select coalesce(sum(delta), 0)::int from star_transactions where user_id = ${userId}) as balance,
      is_active
    from profiles where id = ${userId}
  `;
  if (!row || !row.is_active || row.balance > STAR_FREEZE_THRESHOLD) return;

  try {
    await db`update profiles set is_active = false, frozen_reason = 'star_balance' where id = ${userId}`;
    // Best-effort, same as every other place that revokes a session
    // (updateStaffAction, setPasswordAction): the account is already
    // locked out on its next page load via getAuthState()'s is_active
    // check regardless, so a revoke hiccup here only delays the logout by
    // as long as the existing session cookie has left to live, not skip it.
    await revokeUserSessions(userId);
  } catch (error) {
    console.error('freezeIfBalanceCritical failed', userId, error instanceof Error ? error.message : error);
  }
}

/** Inserts one ledger row and returns its id. Throws on failure — callers
 * decide whether that rolls back a transaction or turns into an
 * `{ error }` result. Then checks whether that write just pushed the
 * balance to the auto-freeze threshold (see freezeIfBalanceCritical) —
 * every star-losing path in the app (task penalty, CEO deduction, Market
 * purchase, rejected task) goes through this one function, so this is the
 * single place that check needs to live. */
export async function insertStarTransaction(
  db: StarLedgerDb,
  { userId, delta, reason = null, sourceType, sourceId = null, createdBy = null }: StarTransactionInput,
): Promise<string> {
  const [row] = await db<{ id: string }[]>`
    insert into star_transactions (user_id, delta, reason, source_type, source_id, created_by)
    values (${userId}, ${delta}, ${reason}, ${sourceType}, ${sourceId}, ${createdBy})
    returning id
  `;
  if (delta < 0) await freezeIfBalanceCritical(db, userId);
  return row.id;
}

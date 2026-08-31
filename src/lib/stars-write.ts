import 'server-only';
import type { Sql, TransactionSql } from 'postgres';
import { sql } from '@/lib/db/client';

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

/** Inserts one ledger row and returns its id. Throws on failure — callers
 * decide whether that rolls back a transaction or turns into an
 * `{ error }` result. */
export async function insertStarTransaction(
  db: StarLedgerDb,
  { userId, delta, reason = null, sourceType, sourceId = null, createdBy = null }: StarTransactionInput,
): Promise<string> {
  const [row] = await db<{ id: string }[]>`
    insert into star_transactions (user_id, delta, reason, source_type, source_id, created_by)
    values (${userId}, ${delta}, ${reason}, ${sourceType}, ${sourceId}, ${createdBy})
    returning id
  `;
  return row.id;
}

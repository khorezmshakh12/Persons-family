import 'server-only';
import { sql } from '@/lib/db/client';
import { deleteIdentityUser } from '@/lib/gcp/adminAuth';
import { revokeUserSessions } from '@/lib/gcp/session';

/** Postgres `foreign_key_violation`. */
const FK_VIOLATION = '23503';

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === FK_VIOLATION;
}

/**
 * Removes a staff account without ever leaving it half-deleted.
 *
 * The old order (Identity Platform user first, then `delete from profiles`)
 * broke for nearly everyone: star_transactions, market_orders,
 * task_comments, weekly_task_reports, task_attachments… all reference
 * profiles(id) without `on delete cascade`, so the profile delete hit a
 * foreign-key error *after* the login was already gone — an account that
 * could not sign in but still showed up as active in the Staff table.
 *
 * Now the profile row goes first, and only once that succeeded is the login
 * deleted:
 *   - no history → hard delete, same as before (`archived: false`);
 *   - has history (FK violation) → the ledger rows are someone's pay/stars
 *     record and must survive, so the account is deactivated instead
 *     (`archived: true`) — the same lock-out a manual deactivation gives,
 *     reversible from the Staff table.
 *
 * Throws on anything unexpected; callers turn that into `{ error }`.
 */
export async function removeStaffAccount(uid: string): Promise<{ archived: boolean }> {
  try {
    await sql`delete from profiles where id = ${uid}`;
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;

    await sql`update profiles set is_active = false where id = ${uid}`;
    try {
      await revokeUserSessions(uid);
    } catch (revokeError) {
      // is_active = false already locks them out on the next request.
      console.error('removeStaffAccount: revoke failed', revokeError instanceof Error ? revokeError.message : revokeError);
    }
    return { archived: true };
  }

  try {
    await deleteIdentityUser(uid);
  } catch (error) {
    // The profile is gone, so getAuthState() already treats any session or
    // fresh login for this uid as signed out — an orphaned login is inert.
    console.error('removeStaffAccount: identity delete failed', uid, error instanceof Error ? error.message : error);
  }
  return { archived: false };
}

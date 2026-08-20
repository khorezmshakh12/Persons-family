import 'server-only';
import { sql } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/gcp/session';

/**
 * Fire-and-forget audit trail entry. `user_id` is always the real caller
 * (server-derived from the session cookie), never a client-supplied value.
 * Never awaited by the caller for its result — a logging failure must never
 * block or fail the action it's describing.
 */
export function logSystemAction(actionType: string, description: string) {
  getCurrentUser()
    .then((user) => sql`
      insert into system_logs (user_id, action_type, description)
      values (${user?.uid ?? null}, ${actionType}, ${description})
    `)
    .catch((error) => console.error('logSystemAction failed', actionType, error));
}

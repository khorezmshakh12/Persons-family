import type { createClient } from '@/lib/supabase/server';

/**
 * Fire-and-forget audit trail entry, written via a security-definer RPC so
 * `user_id` is always the real caller (server-derived from their session),
 * never a client-supplied value. Never awaited by the caller for its result
 * — a logging failure must never block or fail the action it's describing.
 */
export function logSystemAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actionType: string,
  description: string,
) {
  supabase.rpc('log_system_action', { p_action_type: actionType, p_description: description }).then(({ error }) => {
    if (error) console.error('logSystemAction failed', actionType, error);
  });
}

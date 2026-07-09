import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Service-role client that bypasses RLS entirely. Server-only — never import
 * this from a Client Component or anything that could end up in the browser
 * bundle. Used for admin operations like creating a new staff auth account.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

/**
 * Authoritative, page-level auth check. The proxy already gates routes, but
 * Server Action redirects can transition client-side without re-running the
 * proxy — so every protected page/layout re-checks here too. A deactivated
 * staff member is treated as if they had no session at all.
 *
 * Wrapped in React's `cache()` because the (app) layout and nearly every
 * page under it each call this independently — without memoization that's
 * a `supabase.auth.getUser()` round trip to the Auth server (plus a
 * `profiles` lookup) duplicated on every single navigation, on top of the
 * proxy already doing the same work. `cache()` dedupes those calls within
 * one request, so the whole tree shares a single lookup.
 */
export const getAuthState = cache(async function getAuthState() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null as Profile | null, suspended: false };

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { user: null, profile: null as Profile | null, suspended: true };
  }

  return { user, profile: profile as Profile | null, suspended: false };
});

import { createClient } from '@/lib/supabase/server';

/**
 * Authoritative, page-level auth check. The proxy already gates routes, but
 * Server Action redirects can transition client-side without re-running the
 * proxy — so every protected page/layout re-checks here too.
 */
export async function getAuthState() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, mustChangePassword: false };

  const { data: profile } = await supabase
    .from('profiles')
    .select('must_change_password')
    .eq('id', user.id)
    .single();

  return { user, mustChangePassword: profile?.must_change_password ?? false };
}

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './types';

/**
 * Refreshes the Supabase session for the current request/response pair and
 * reports whether the caller must still set a permanent password. Mutates
 * `response` in place with any refreshed auth cookies. A deactivated staff
 * member is treated as if they had no session at all.
 */
export async function getSessionUser(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, mustChangePassword: false, suspended: false };

  const { data: profile } = await supabase
    .from('profiles')
    .select('must_change_password, is_active')
    .eq('id', user.id)
    .single();

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { user: null, mustChangePassword: false, suspended: true };
  }

  return { user, mustChangePassword: profile?.must_change_password ?? false, suspended: false };
}

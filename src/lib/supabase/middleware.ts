import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './types';

/**
 * Refreshes the Supabase session for the current request and reports
 * whether the caller must still set a permanent password. A deactivated
 * staff member is treated as if they had no session at all.
 *
 * Returns a `response` that must be used (or have its cookies copied onto
 * whatever response is ultimately returned from proxy.ts). Per Supabase's
 * documented Next.js pattern, refreshed cookies have to be re-applied to
 * `request.cookies` *and* a freshly-built `NextResponse.next({ request })`
 * has to be created afterwards — recreating the response is what makes the
 * refreshed session visible to this same request's downstream render (e.g.
 * next-intl's middleware and the (app) layout both read `request` again
 * after this runs). Reusing a response object created before the refresh
 * (or only writing Set-Cookie headers without rebuilding the response) lets
 * the browser end up with a valid new session while this render still sees
 * the stale, already-rotated-out refresh token — which reads as "logged
 * out until I refresh the page".
 */
export async function getSessionUser(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
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

  if (!user) return { user: null, mustChangePassword: false, suspended: false, response };

  const { data: profile } = await supabase
    .from('profiles')
    .select('must_change_password, is_active')
    .eq('id', user.id)
    .single();

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { user: null, mustChangePassword: false, suspended: true, response };
  }

  return {
    user,
    mustChangePassword: profile?.must_change_password ?? false,
    suspended: false,
    response,
  };
}

import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "./credentials";
import { SESSION_COOKIE_NAME } from "./session";

/**
 * Verifies the Identity Platform session cookie for the current request.
 * Unlike the old Supabase cookie-adapter dance, this needs no per-request
 * refresh/rotation — the session cookie is checked locally (JWT signature)
 * and is valid as-is for up to 14 days, so `response` here is always just
 * a plain passthrough rather than something that needs cookies copied onto
 * it. Kept as an object return (rather than a bare user) to match the
 * shape proxy.ts already expects.
 *
 * IMPORTANT — this is a LOCAL check only (`verifySessionCookie(cookie)` with
 * no `checkRevoked`). Passing `checkRevoked: true` here made a network call
 * to Identity Platform on *every* request in the middleware hot path; when
 * that call flaked (cold instance, transient 5xx, quota) the `catch` below
 * silently returned `user: null` for that one request, and because
 * proxy.ts sends "/login -> /dashboard when logged in" and "/dashboard ->
 * /login when not", an intermittent failure turned into a tight
 * /login <-> /dashboard 307 redirect loop that locked people out.
 * Revocation / deactivation is still enforced authoritatively one layer up:
 * getAuthState() in lib/auth/session.ts does a live `profiles.is_active`
 * read on the (app) layout and every protected page and bounces a
 * deactivated user (and it re-reads `role` live too, so a demotion takes
 * effect on the next navigation regardless of the stale cookie claim).
 */
export async function getSessionUser(request: NextRequest) {
  const response = NextResponse.next({ request });
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!cookie) return { user: null, mustChangePassword: false, suspended: false, response };

  try {
    const decoded = await getAuth(getFirebaseAdminApp()).verifySessionCookie(cookie);
    return {
      user: { id: decoded.uid },
      // Mirrored into the session cookie as a custom claim (see
      // lib/gcp/adminAuth.ts's setUserClaims) so this doesn't need a DB
      // round trip on every request — updated proactively whenever the
      // DB value changes (account creation, resetStaffPasswordAction,
      // setPasswordAction) and takes effect on that user's *next* login,
      // since claims are baked into the session cookie at mint time.
      mustChangePassword: decoded.mustChangePassword === true,
      suspended: false,
      response,
    };
  } catch {
    // Invalid signature or expired cookie only (no revocation check here by
    // design — see the note above). A genuinely revoked-but-unexpired
    // cookie is caught by getAuthState()'s live is_active read on the very
    // next page render.
    return { user: null, mustChangePassword: false, suspended: false, response };
  }
}

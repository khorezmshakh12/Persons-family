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
 */
export async function getSessionUser(request: NextRequest) {
  const response = NextResponse.next({ request });
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!cookie) return { user: null, mustChangePassword: false, suspended: false, response };

  try {
    const decoded = await getAuth(getFirebaseAdminApp()).verifySessionCookie(cookie, true);
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
    // Covers both "invalid/expired cookie" and "revoked" (checkRevoked:
    // true above) — a deactivated staff member's session was revoked by
    // getAuthState()/session.ts the moment their profile was found
    // inactive, so a stale cookie here always means "treat as logged out".
    return { user: null, mustChangePassword: false, suspended: false, response };
  }
}

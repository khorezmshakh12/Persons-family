import "server-only";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, GCP_PROJECT_ID } from "./credentials";
import { sql } from "@/lib/db/client";

export const SESSION_COOKIE_NAME = "session";
const SESSION_EXPIRES_IN_MS = 1000 * 60 * 60 * 24 * 14;

export interface SessionUser {
  uid: string;
  // Alias for `uid` — profiles.id in Cloud SQL *is* the Identity Platform
  // uid, so the two are always the same string. Added because most of this
  // codebase's Server Actions read `user.id` (carried over from the
  // Supabase-auth-user shape everything was originally written against),
  // and rewriting every one of those call sites was a needless, error-prone
  // mechanical sweep compared to just aliasing it here.
  id: string;
  email: string | null;
  role: string | null;
  /** When this session cookie was minted (JWT `iat`, seconds since epoch).
   * getAuthState() compares it against profiles.sessions_revoked_at — see
   * revokeUserSessions below. */
  issuedAt: number;
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ idToken: string } | null> {
  const apiKey = process.env.IDENTITY_PLATFORM_API_KEY;
  if (!apiKey) throw new Error("IDENTITY_PLATFORM_API_KEY is required");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  if (!res.ok) return null;
  const data = (await res.json()) as { idToken: string };
  return { idToken: data.idToken };
}

export async function createSessionCookie(idToken: string): Promise<string> {
  const auth = getAuth(getFirebaseAdminApp());
  return auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN_MS });
}

// Mints a brand-new session cookie for the currently-active user, carrying
// whatever custom claims (role, mustChangePassword) are on their account
// *right now* — used right after an action changes one of those claims for
// the same session that's still live, since a session cookie's claims are
// otherwise frozen at mint time until the next full login (up to 14 days
// later). Without this, proxy.ts's fast-path claim check and a page's own
// live-DB check can permanently disagree mid-session — e.g. setPasswordAction
// clearing mustChangePassword in the DB while the cookie still says true —
// producing an infinite /dashboard <-> /set-password redirect loop. Same
// custom-token-exchange technique as the Persons Materials SSO bridge.
export async function reissueSessionCookie(uid: string): Promise<string> {
  const auth = getAuth(getFirebaseAdminApp());
  const customToken = await auth.createCustomToken(uid);

  const apiKey = process.env.IDENTITY_PLATFORM_API_KEY;
  if (!apiKey) throw new Error("IDENTITY_PLATFORM_API_KEY is required");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error("Failed to exchange custom token while reissuing session cookie");
  const { idToken } = (await res.json()) as { idToken: string };

  return createSessionCookie(idToken);
}

// Deferred import: next/headers only resolves inside the Next.js runtime,
// so keeping it out of this module's top-level imports lets the rest of
// session.ts run in plain Node scripts too.
export async function getCurrentUser(checkRevoked = false): Promise<SessionUser | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  try {
    const auth = getAuth(getFirebaseAdminApp());
    const decoded = await auth.verifySessionCookie(cookie, checkRevoked);
    return {
      uid: decoded.uid,
      id: decoded.uid,
      email: decoded.email ?? null,
      role: typeof decoded.role === "string" ? decoded.role : null,
      issuedAt: decoded.iat,
    };
  } catch {
    return null;
  }
}

/**
 * Signs the user out everywhere.
 *
 * revokeRefreshTokens() alone was not enough: session cookies are verified
 * locally without `checkRevoked` (see lib/gcp/middleware.ts for why), so a
 * revoked cookie kept working for its full 14-day life. Stamping
 * profiles.sessions_revoked_at is what getAuthState() actually enforces —
 * any cookie minted before this second is treated as signed out.
 *
 * Truncated to the second because the cookie's `iat` is in whole seconds: a
 * cookie minted in the same second (e.g. a login right after a logout) must
 * not be rejected. Best-effort on the DB side so a missing column (migration
 * not yet applied) never breaks the callers.
 *
 * `stampDb: false` is for callers running inside a `sql.begin` transaction
 * that has already written this user's profiles row: the stamp goes through
 * the shared client (a different connection), so it would wait on that
 * transaction's row lock while the transaction waits on this call — a
 * deadlock. Those callers deactivate the account instead, and getAuthState()
 * re-runs this with the stamp on the user's next request.
 */
export async function revokeUserSessions(
  uid: string,
  { stampDb = true }: { stampDb?: boolean } = {}
): Promise<void> {
  if (stampDb) {
    try {
      await sql`update profiles set sessions_revoked_at = date_trunc('second', now()) where id = ${uid}`;
    } catch (error) {
      console.error("revokeUserSessions: DB stamp failed", error instanceof Error ? error.message : error);
    }
  }
  const auth = getAuth(getFirebaseAdminApp());
  await auth.revokeRefreshTokens(uid);
}

export { GCP_PROJECT_ID };

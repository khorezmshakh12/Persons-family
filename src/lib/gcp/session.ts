import "server-only";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, GCP_PROJECT_ID } from "./credentials";

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
    };
  } catch {
    return null;
  }
}

export async function revokeUserSessions(uid: string): Promise<void> {
  const auth = getAuth(getFirebaseAdminApp());
  await auth.revokeRefreshTokens(uid);
}

export { GCP_PROJECT_ID };

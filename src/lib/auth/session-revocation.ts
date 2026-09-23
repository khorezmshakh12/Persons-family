/**
 * Pure helper (no server-only imports) so it can be unit-tested — see
 * tests/session-revocation.test.ts. Used by getAuthState().
 *
 * True when a session cookie was minted strictly before the account's last
 * revocation (profiles.sessions_revoked_at, stamped by revokeUserSessions).
 * `issuedAtSeconds` is the cookie's JWT `iat` (whole seconds) and the stamp
 * is truncated to the second, so a cookie minted in the revocation second
 * itself — e.g. a fresh login right after — stays valid.
 */
export function isSessionRevoked(issuedAtSeconds: number, revokedAt: string | null | undefined): boolean {
  if (!revokedAt) return false;
  const revokedMs = Date.parse(revokedAt);
  return Number.isFinite(revokedMs) && issuedAtSeconds * 1000 < revokedMs;
}

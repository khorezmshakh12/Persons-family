-- ==========================================================================
-- Session revocation that actually revokes.
--
-- revokeUserSessions() used to call only Identity Platform's
-- revokeRefreshTokens(), but session cookies are verified locally
-- (verifySessionCookie without checkRevoked — see lib/gcp/middleware.ts for
-- why the network check was removed), so a logged-out / password-reset
-- cookie kept working for up to 14 days.
--
-- getAuthState() already reads the profile row on every protected request,
-- so it compares the cookie's own `iat` (mint time, seconds) against this
-- column: a cookie minted strictly before the revocation second is rejected.
-- null = never revoked.
--
-- Additive / IF NOT EXISTS, safe to re-run. The app tolerates the column
-- being absent (it simply skips the check), so deploy order does not matter.
-- ==========================================================================

begin;

alter table profiles add column if not exists sessions_revoked_at timestamptz;

commit;

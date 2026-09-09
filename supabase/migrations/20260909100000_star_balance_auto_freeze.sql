-- ==========================================================================
-- Star-balance auto-freeze: a staff member whose star balance drops to -20
-- or below is locked out of the platform automatically (is_active = false,
-- same mechanism a CEO's manual deactivation already uses — see
-- getAuthState() in src/lib/auth/session.ts), with a specific reason
-- recorded so the login page can show a message distinct from a manual
-- deactivation. Run:
--   psql "$DATABASE_URL" -f supabase/migrations/20260909100000_star_balance_auto_freeze.sql
--
-- Every statement is additive / IF NOT EXISTS, so it is safe to re-run.
-- ==========================================================================

begin;

-- null = never frozen, or a manual CEO deactivation (is_active toggled off
-- from the Staff table directly, which never sets this column). Any other
-- value names why an automated flow froze the account — currently only
-- 'star_balance', but a text column (not a boolean) leaves room for a
-- different automated reason later without another migration.
alter table profiles add column if not exists frozen_reason text;

commit;

-- createTelegramLinkTokenAction chains .insert().select().single() to
-- return the freshly minted token to the caller. Without any SELECT policy
-- at all, that representation-return fails RLS even though the insert
-- itself satisfies its own WITH CHECK — Postgres has nothing to fall back
-- to for RETURNING once explicitly asked to re-select the row.
--
-- This isn't a security regression from the original design: reading back
-- a token you *just created* was never the risk (see the original
-- migration's comment) — the risk was another user reading YOUR token,
-- which stays impossible since this is still scoped to profile_id =
-- auth.uid().
create policy "telegram_link_tokens_select_self"
  on telegram_link_tokens for select
  to authenticated
  using (profile_id = auth.uid());

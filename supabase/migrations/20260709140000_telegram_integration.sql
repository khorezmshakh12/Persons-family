-- Telegram integration: lets staff link their Telegram account to receive
-- notifications, and gives the CEO a broadcast tool.

alter table profiles add column telegram_id bigint unique;

-- Short-lived, single-use link tokens for the "Connect Telegram" deep link
-- (t.me/<bot>?start=<token>). Deliberately NOT just the profile's own id:
-- profiles_select_all lets any authenticated staff member read any other
-- profile's id, so a raw profile-id deep link would let one staff member
-- hijack another's notification binding by opening the bot with their
-- colleague's id. A token minted fresh per "Connect" click, expiring in 15
-- minutes and consumed on first use, closes that off.
create table telegram_link_tokens (
  token uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

alter table telegram_link_tokens enable row level security;

-- No select/update policy at all, for anyone: the token is returned
-- directly in the mint action's response and embedded in the link/QR code
-- shown to that one user — it never needs to be queried back out of the
-- table by the client. Consuming and deleting a token happens exclusively
-- from the Telegram webhook, which runs with no user session and uses the
-- service-role client (bypasses RLS entirely), not through these policies.
create policy "telegram_link_tokens_insert_self"
  on telegram_link_tokens for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "telegram_link_tokens_delete_self"
  on telegram_link_tokens for delete
  to authenticated
  using (profile_id = auth.uid());

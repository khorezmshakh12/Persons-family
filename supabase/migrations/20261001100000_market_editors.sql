-- ==========================================================================
-- Market editors: people other than the CEO who may manage Persons Market
-- items (add / edit / photo / star price / stock / hide / delete). Order
-- decisions (which move stars) stay CEO-only. Owner's decision 2026-09-29:
-- Muhammad Solih Ne'matullayev, permanent until the owner says otherwise.
-- Additive / idempotent.
-- ==========================================================================

begin;

create table if not exists market_editors (
  user_id   uuid primary key references profiles(id) on delete cascade,
  added_at  timestamptz not null default now()
);

-- Matched by name (any apostrophe variant, either name split).
insert into market_editors (user_id)
select id from profiles
where (first_name || ' ' || last_name) ~* '^\s*muhammad\s*solih\s+ne.{0,2}matull?ayev'
   or (last_name || ' ' || first_name) ~* '^\s*ne.{0,2}matull?ayev\s+muhammad\s*solih'
on conflict (user_id) do nothing;

do $$ begin
  raise notice 'market_editors rows: %', (select count(*) from market_editors);
end $$;

commit;

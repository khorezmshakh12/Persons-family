-- ==========================================================================
-- Several positions per person (owner, 2026-09-30). profiles.role stays the
-- primary position; profile_roles lists the extra ones. The person works in
-- one at a time — the active role picked in the header (see getAuthState).
-- CEO and COO grant / revoke them on the "Lavozimlar" page.
-- Also: the owner (IT Developer) additionally holds COO.
-- Runs after 20261002100000 (which adds 'coo' to the enum). Idempotent.
-- ==========================================================================

begin;

create table if not exists profile_roles (
  user_id     uuid not null references profiles(id) on delete cascade,
  role        staff_role not null,
  granted_by  uuid references profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);

-- The owner: matched by e-mail; otherwise the single active IT Developer.
insert into profile_roles (user_id, role)
select id, 'coo'::staff_role from profiles
where lower(email) = 'azizullahusman2@gmail.com'
   or (
     role = 'it_developer' and is_active
     and (select count(*) from profiles where role = 'it_developer' and is_active) = 1
     and not exists (select 1 from profiles where lower(email) = 'azizullahusman2@gmail.com')
   )
on conflict do nothing;

do $$ begin
  raise notice 'profile_roles coo rows: %', (select count(*) from profile_roles where role = 'coo');
end $$;

commit;

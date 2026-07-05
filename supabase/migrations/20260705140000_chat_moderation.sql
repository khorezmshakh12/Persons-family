-- Advanced chat moderation: pinning, admin-delete-any, and a global chat
-- enable/disable switch.

alter table chat_messages add column pinned_at timestamptz;

-- Admins can delete any message. Combines via OR with the existing
-- "chat_delete_own" policy, so self-delete keeps working for everyone.
create policy "chat_delete_admin"
  on chat_messages for delete
  to authenticated
  using (public.is_admin());

-- chat_messages had no update policy before pinning existed — admins only.
create policy "chat_update_admin"
  on chat_messages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Singleton settings row (a boolean primary key with a check constraint
-- guarantees exactly one row) — simpler than a generic key/value table for
-- the one flag we need today.
create table app_settings (
  id boolean primary key default true check (id),
  chat_enabled boolean not null default true,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (true);

alter table app_settings enable row level security;

create policy "app_settings_select"
  on app_settings for select
  to authenticated
  using (true);

create policy "app_settings_update_admin"
  on app_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Same reasoning as chat_messages: Realtime needs the full old row to safely
-- authorize UPDATE broadcasts against RLS.
alter table app_settings replica identity full;
alter publication supabase_realtime add table app_settings;

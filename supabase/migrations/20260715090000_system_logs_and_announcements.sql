-- Persons ERP v1.5 (round 2): audit trail + global announcement banner.

-- system_logs ----------------------------------------------------------------
create table system_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  action_type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index system_logs_created_at_idx on system_logs (created_at desc);

alter table system_logs enable row level security;

create policy "system_logs_select_admin"
  on system_logs for select
  to authenticated
  using (public.is_admin());

-- No direct insert policy for authenticated — writes only happen through
-- this security-definer function, so every log entry's user_id is always
-- the real caller (auth.uid()), never a client-supplied value.
create or replace function public.log_system_action(p_action_type text, p_description text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into system_logs (user_id, action_type, description)
  values (auth.uid(), p_action_type, p_description)
$$;

grant execute on function public.log_system_action(text, text) to authenticated;

-- platform_announcements -------------------------------------------------------
create table platform_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table platform_announcements enable row level security;

-- Every authenticated user reads the current banner; publishing is CEO-only.
create policy "platform_announcements_select"
  on platform_announcements for select
  to authenticated
  using (true);

create policy "platform_announcements_insert_ceo"
  on platform_announcements for insert
  to authenticated
  with check (public.current_role() = 'ceo');

create policy "platform_announcements_delete_ceo"
  on platform_announcements for delete
  to authenticated
  using (public.current_role() = 'ceo');

alter publication supabase_realtime add table platform_announcements;

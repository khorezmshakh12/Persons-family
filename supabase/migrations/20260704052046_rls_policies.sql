-- Row Level Security for all tables, plus helper functions used across policies.

-- Reads the caller's role. security definer so it can read `profiles` without
-- triggering the recursive-policy problem of profiles' own RLS checking itself.
create or replace function public.current_role()
returns staff_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_role() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('ceo', 'admin_manager')
  )
$$;

grant execute on function public.is_admin() to authenticated;

-- Prevents a non-admin from changing their own role or identity fields via a
-- self-update (e.g. a teacher promoting themselves to ceo).
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
      or new.phone is distinct from old.phone
      or new.first_name is distinct from old.first_name
      or new.last_name is distinct from old.last_name
      or new.date_of_birth is distinct from old.date_of_birth
      or new.is_active is distinct from old.is_active
    then
      raise exception 'Only an admin can change this field';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_fields_trigger
  before update on profiles
  for each row execute function public.protect_profile_fields();

-- profiles --------------------------------------------------------------
alter table profiles enable row level security;

create policy "profiles_select_all"
  on profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_admin"
  on profiles for insert
  to authenticated
  with check (public.is_admin());

create policy "profiles_update_admin"
  on profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_update_self"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- attendance --------------------------------------------------------------
alter table attendance enable row level security;

create policy "attendance_select"
  on attendance for select
  to authenticated
  using (public.is_admin() or user_id = auth.uid());

create policy "attendance_insert_self"
  on attendance for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "attendance_update_self"
  on attendance for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- chat_messages -------------------------------------------------------------
alter table chat_messages enable row level security;

create policy "chat_select_all"
  on chat_messages for select
  to authenticated
  using (true);

create policy "chat_insert_self"
  on chat_messages for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "chat_delete_own"
  on chat_messages for delete
  to authenticated
  using (user_id = auth.uid());

-- issues ----------------------------------------------------------------
alter table issues enable row level security;

create policy "issues_select"
  on issues for select
  to authenticated
  using (public.is_admin() or created_by = auth.uid());

create policy "issues_insert_self"
  on issues for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "issues_update_admin"
  on issues for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- lesson_plans ------------------------------------------------------------
alter table lesson_plans enable row level security;

create policy "lesson_plans_select"
  on lesson_plans for select
  to authenticated
  using (
    public.current_role() in ('assistant', 'ceo', 'admin_manager')
    or teacher_id = auth.uid()
  );

create policy "lesson_plans_insert_teacher"
  on lesson_plans for insert
  to authenticated
  with check (
    public.current_role() = 'teacher' and teacher_id = auth.uid()
  );

create policy "lesson_plans_update_teacher"
  on lesson_plans for update
  to authenticated
  using (
    public.current_role() = 'teacher' and teacher_id = auth.uid()
  )
  with check (
    public.current_role() = 'teacher' and teacher_id = auth.uid()
  );

create policy "lesson_plans_delete_teacher"
  on lesson_plans for delete
  to authenticated
  using (
    public.current_role() = 'teacher' and teacher_id = auth.uid()
  );

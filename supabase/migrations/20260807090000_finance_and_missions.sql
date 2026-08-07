-- Finance: a free-form, append-only per-staff ledger (title + signed amount
-- + optional note), the same "CEO logs it, the staff member sees their own
-- history" shape as performance_entries — but not tied to bonus/penalty
-- semantics, since what goes in here is intentionally open-ended (the CEO
-- is populating it with whatever material fits, one entry at a time).
-- Positive amount = credit/income, negative = a deduction/expense — a
-- single signed column instead of an entry_type enum, since the category
-- isn't fixed up front the way bonus/penalty was.
create table finance_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  amount numeric(14, 2) not null,
  note text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index finance_entries_staff_id_idx on finance_entries (staff_id);

alter table finance_entries enable row level security;

create policy "finance_entries_select"
  on finance_entries for select
  to authenticated
  using (public.is_admin() or staff_id = auth.uid());

create policy "finance_entries_insert_admin"
  on finance_entries for insert
  to authenticated
  with check (public.is_admin());

create policy "finance_entries_delete_admin"
  on finance_entries for delete
  to authenticated
  using (public.is_admin());

-- Missions: a personal goal/objective the CEO assigns to one staff member
-- at a time. The assignee (and only the assignee — mirrors tasks' own
-- "status is the assignee's own progress report" rule from
-- 20260806130000_task_status_assignee_only.sql) can mark their own mission
-- complete; everything else about it stays CEO-authored.
create table missions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  description text,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index missions_staff_id_idx on missions (staff_id);

alter table missions enable row level security;

create policy "missions_select"
  on missions for select
  to authenticated
  using (public.is_admin() or staff_id = auth.uid());

create policy "missions_insert_admin"
  on missions for insert
  to authenticated
  with check (public.is_admin());

create policy "missions_update"
  on missions for update
  to authenticated
  using (public.is_admin() or staff_id = auth.uid())
  with check (public.is_admin() or staff_id = auth.uid());

create policy "missions_delete_admin"
  on missions for delete
  to authenticated
  using (public.is_admin());

create or replace function public.protect_mission_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.staff_id is distinct from old.staff_id
    then
      raise exception 'Only an admin can change this field';
    end if;
  end if;
  if new.is_completed is distinct from old.is_completed and auth.uid() <> new.staff_id and not public.is_admin() then
    raise exception 'Only the assignee can change this mission''s status';
  end if;
  return new;
end;
$$;

create trigger protect_mission_fields_trigger
  before update on missions
  for each row execute function public.protect_mission_fields();

-- Task Delegation Board.
create type task_status as enum ('pending', 'in_progress', 'done');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid not null references profiles (id) on delete cascade,
  assigned_by uuid not null references profiles (id),
  due_date date,
  status task_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_assigned_to_idx on tasks (assigned_to);

alter table tasks enable row level security;

create policy "tasks_select"
  on tasks for select
  to authenticated
  using (public.is_admin() or assigned_to = auth.uid());

create policy "tasks_insert_admin"
  on tasks for insert
  to authenticated
  with check (public.is_admin());

create policy "tasks_update"
  on tasks for update
  to authenticated
  using (public.is_admin() or assigned_to = auth.uid())
  with check (public.is_admin() or assigned_to = auth.uid());

create policy "tasks_delete_admin"
  on tasks for delete
  to authenticated
  using (public.is_admin());

-- Mirrors protect_profile_fields: a non-admin assignee may move their own
-- task through the board (status only) but can't reassign, reschedule, or
-- reword it.
create or replace function public.protect_task_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.assigned_to is distinct from old.assigned_to
      or new.assigned_by is distinct from old.assigned_by
      or new.due_date is distinct from old.due_date
    then
      raise exception 'Only an admin can change this field';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger protect_task_fields_trigger
  before update on tasks
  for each row execute function public.protect_task_fields();

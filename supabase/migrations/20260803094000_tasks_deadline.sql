-- Taskbar: every task now requires a Deadline (date + time), not just the
-- date-only due_date it had before. due_date is left in place rather than
-- renamed/dropped (same precedent as every other retired column in this
-- project — see performance_entries' note) — the backend/frontend phase
-- switches reads/writes to deadline and simply stops touching due_date.
--
-- Backfill: existing rows get due_date at end-of-day where a due_date was
-- set, or created_at + 7 days where it wasn't, so the column can go NOT NULL
-- without losing any row.
alter table tasks add column deadline timestamptz;

update tasks
set deadline = coalesce(due_date::timestamptz + interval '23 hours 59 minutes', created_at + interval '7 days');

alter table tasks alter column deadline set not null;

-- Mirrors protect_task_fields' existing due_date protection: a non-admin
-- assignee can move their own task through the board (status only) but
-- can't reschedule it.
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
      or new.deadline is distinct from old.deadline
    then
      raise exception 'Only an admin can change this field';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

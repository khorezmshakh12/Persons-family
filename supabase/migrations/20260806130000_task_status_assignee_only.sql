-- protect_task_fields let any admin (assigned_by) change a task's status
-- too, since it only ever blocked non-admins from touching fields outside
-- title/description/assigned_to/assigned_by/due_date/deadline — status was
-- simply never in that list. That meant the person who assigned a task
-- could also drag it across the board themselves, which defeats the point
-- of status as the assignee's own progress report. Status changes are now
-- restricted to the assignee specifically, regardless of admin status;
-- every other field keeps its existing admin-only protection unchanged.
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
  if new.status is distinct from old.status and auth.uid() <> new.assigned_to then
    raise exception 'Only the assignee can change this task''s status';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

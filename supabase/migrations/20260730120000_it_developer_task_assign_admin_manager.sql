-- IT Developer gets one more narrow carve-out, symmetric to its
-- account-creation power (profiles_insert_admin): it may give tasks to an
-- Administrative Manager specifically, and only that role — see
-- allowedTaskAssigneeRoles and requireTaskAssigner in actions/tasks.ts.

drop policy "tasks_insert_admin" on tasks;
create policy "tasks_insert_admin"
  on tasks for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.current_role() = 'it_developer'
      and exists (select 1 from public.profiles p where p.id = tasks.assigned_to and p.role = 'admin_manager')
    )
  );

-- protect_task_fields blocked anyone but is_admin() (now CEO-only) from
-- editing a task's title/description/assignee/due date on UPDATE — IT
-- Developer needs that same edit access, but only for a task it originally
-- assigned (old.assigned_by = auth.uid()), mirroring the equivalent
-- admin_manager carve-out already added to protect_issue_fields.
create or replace function public.protect_task_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (
    public.is_admin()
    or (public.current_role() = 'it_developer' and old.assigned_by = auth.uid())
  ) then
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

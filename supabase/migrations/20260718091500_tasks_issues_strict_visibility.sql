-- Tasks: strict "creator or assignee only" visibility. Previously any admin
-- could see every task via is_admin() — now a task is only visible to the
-- admin who created it (assigned_by) and the person it's assigned to
-- (assigned_to). Mirrors the same tightening on update/delete so RLS
-- doesn't grant a mutation path wider than what select allows.
drop policy "tasks_select" on tasks;
create policy "tasks_select"
  on tasks for select
  to authenticated
  using (assigned_by = auth.uid() or assigned_to = auth.uid());

drop policy "tasks_update" on tasks;
create policy "tasks_update"
  on tasks for update
  to authenticated
  using (assigned_by = auth.uid() or assigned_to = auth.uid())
  with check (assigned_by = auth.uid() or assigned_to = auth.uid());

drop policy "tasks_delete_admin" on tasks;
create policy "tasks_delete_own"
  on tasks for delete
  to authenticated
  using (assigned_by = auth.uid());

-- Issues: creators (not just admins) can now edit their own issue's text and
-- delete it outright, regardless of status. Everything except title/
-- description stays admin-only for a non-admin editor (mirrors
-- protect_task_fields) so a creator editing their own issue can't also
-- reassign it, resolve it, or attach a voice note through the same path.
drop policy "issues_update_admin" on issues;
create policy "issues_update"
  on issues for update
  to authenticated
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());

drop policy "issues_delete_admin" on issues;
create policy "issues_delete"
  on issues for delete
  to authenticated
  using (public.is_admin() or created_by = auth.uid());

create or replace function public.protect_issue_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.status is distinct from old.status
      or new.assigned_to is distinct from old.assigned_to
      or new.resolved_by is distinct from old.resolved_by
      or new.resolved_at is distinct from old.resolved_at
      or new.voice_url is distinct from old.voice_url
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Only an admin can change this field';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_issue_fields_trigger
  before update on issues
  for each row execute function public.protect_issue_fields();

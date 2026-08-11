-- Lesson-plan domain: IT Developer loses all access (view, comment, content
-- moderation); Head Teacher gains view + comment (not content moderation —
-- that stays CEO-only, mirroring how course_lessons_update already singled
-- out the CEO specifically rather than using is_admin()).
drop policy "groups_select" on groups;
create policy "groups_select"
  on groups for select
  to authenticated
  using (
    public.current_role() in ('ceo', 'head_teacher')
    or teacher_id = auth.uid()
    or public.is_assigned_ta(id)
  );

drop policy "course_lessons_select" on course_lessons;
create policy "course_lessons_select"
  on course_lessons for select
  to authenticated
  using (
    public.current_role() in ('ceo', 'head_teacher')
    or public.is_group_owner(group_id)
    or public.is_assigned_ta(group_id)
  );

drop policy "weekly_lesson_plans_select" on weekly_lesson_plans;
create policy "weekly_lesson_plans_select"
  on weekly_lesson_plans for select
  to authenticated
  using (
    public.current_role() in ('ceo', 'head_teacher')
    or public.is_group_owner(group_id)
    or public.current_role() = 'assistant'
  );

drop policy "lesson_plan_days_select" on lesson_plan_days;
create policy "lesson_plan_days_select"
  on lesson_plan_days for select
  to authenticated
  using (
    public.current_role() in ('ceo', 'head_teacher')
    or public.current_role() = 'assistant'
    or exists (
      select 1 from weekly_lesson_plans wlp
      where wlp.id = lesson_plan_days.weekly_plan_id and public.is_group_owner(wlp.group_id)
    )
  );

drop policy "lesson_comments_select" on lesson_comments;
create policy "lesson_comments_select"
  on lesson_comments for select
  to authenticated
  using (
    public.current_role() in ('ceo', 'head_teacher')
    or exists (
      select 1 from course_lessons cl
      where cl.id = lesson_comments.lesson_id
        and (public.is_group_owner(cl.group_id) or public.is_assigned_ta(cl.group_id))
    )
  );

drop policy "lesson_comments_insert" on lesson_comments;
create policy "lesson_comments_insert"
  on lesson_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.current_role() in ('ceo', 'head_teacher')
      or exists (
        select 1 from course_lessons cl
        where cl.id = lesson_comments.lesson_id and public.is_assigned_ta(cl.group_id)
      )
    )
  );

drop policy "lesson_plan_comments_select" on lesson_plan_comments;
create policy "lesson_plan_comments_select"
  on lesson_plan_comments for select
  to authenticated
  using (
    public.current_role() in ('ceo', 'head_teacher')
    or public.current_role() = 'assistant'
    or exists (
      select 1 from lesson_plan_days d
      join weekly_lesson_plans wlp on wlp.id = d.weekly_plan_id
      where d.id = lesson_plan_comments.lesson_plan_day_id and public.is_group_owner(wlp.group_id)
    )
  );

drop policy "lesson_plan_comments_insert" on lesson_plan_comments;
create policy "lesson_plan_comments_insert"
  on lesson_plan_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (public.current_role() in ('ceo', 'head_teacher') or public.current_role() = 'assistant')
  );

-- Content moderation stays CEO-only (Head Teacher wasn't asked to get this,
-- only viewing + commenting) — just drops IT Developer.
drop policy "course_lessons_update" on course_lessons;
create policy "course_lessons_update"
  on course_lessons for update
  to authenticated
  using (public.is_group_owner(group_id) or public.current_role() = 'ceo')
  with check (public.is_group_owner(group_id) or public.current_role() = 'ceo');

drop policy "lesson_materials_update" on storage.objects;
create policy "lesson_materials_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.current_role() = 'ceo')
  )
  with check (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.current_role() = 'ceo')
  );

drop policy "lesson_materials_delete" on storage.objects;
create policy "lesson_materials_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.current_role() = 'ceo')
  );

-- Tasks: CEO-only to create/assign/edit — also fixes a regression where
-- protect_task_fields() had silently reverted to a bare is_admin() check
-- (letting IT Developer edit any task's fields, not just ones it created)
-- after 20260806130000_task_status_assignee_only.sql's create-or-replace
-- dropped the narrower carve-out added in
-- 20260730120000_it_developer_task_assign_admin_manager.sql.
drop policy "tasks_insert_admin" on tasks;
create policy "tasks_insert_admin"
  on tasks for insert
  to authenticated
  with check (public.current_role() = 'ceo');

create or replace function public.protect_task_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'ceo' then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.assigned_to is distinct from old.assigned_to
      or new.assigned_by is distinct from old.assigned_by
      or new.due_date is distinct from old.due_date
      or new.deadline is distinct from old.deadline
    then
      raise exception 'Only the CEO can change this field';
    end if;
  end if;
  if new.status is distinct from old.status and auth.uid() <> new.assigned_to then
    raise exception 'Only the assignee can change this task''s status';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

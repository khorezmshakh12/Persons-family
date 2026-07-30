-- Administrative Manager stops being a general admin role. It keeps only:
--   - viewing every group's lesson plans and commenting on them (like a
--     limited CEO/assistant, never editing content or deleting files)
--   - receiving tasks (already worked, no RLS change needed there)
--   - receiving issues and changing the status of ones assigned to it
--   - submitting its own self-development entries (like a teacher)
--   - read-only visibility into the Teacher/TA staff chat (already granted
--     via staff_chat_messages_select's public.is_admin() clause — re-added below
--     explicitly since public.is_admin() itself no longer covers admin_manager)
-- Everything else that used to come from public.is_admin() — staff management,
-- Telegram setup, task creation/assignment, issue admin (delete/reassign/
-- edit-any), company news, chat pin, self-development evaluation, staff
-- performance/tiers — is now CEO-only. Redefining public.is_admin() to mean "ceo
-- only" flips that default for every policy/trigger built on top of it in
-- one place; the handful of policies that must keep admin_manager visibility
-- get it re-added explicitly below.

create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ceo'
  )
$$;

-- Lesson-plan visibility + commenting: admin_manager keeps these explicitly.

drop policy "groups_select" on groups;
create policy "groups_select"
  on groups for select
  to authenticated
  using (public.is_admin() or public.current_role() = 'admin_manager' or teacher_id = auth.uid() or public.is_assigned_ta(id));

drop policy "course_lessons_select" on course_lessons;
create policy "course_lessons_select"
  on course_lessons for select
  to authenticated
  using (public.is_admin() or public.current_role() = 'admin_manager' or public.is_group_owner(group_id) or public.is_assigned_ta(group_id));

drop policy "weekly_lesson_plans_select" on weekly_lesson_plans;
create policy "weekly_lesson_plans_select"
  on weekly_lesson_plans for select
  to authenticated
  using (
    public.is_admin()
    or public.current_role() = 'admin_manager'
    or public.is_group_owner(group_id)
    or public.current_role() = 'assistant'
  );

drop policy "lesson_plan_days_select" on lesson_plan_days;
create policy "lesson_plan_days_select"
  on lesson_plan_days for select
  to authenticated
  using (
    public.is_admin()
    or public.current_role() = 'admin_manager'
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
    public.is_admin()
    or public.current_role() = 'admin_manager'
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
      public.is_admin()
      or public.current_role() = 'admin_manager'
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
    public.is_admin()
    or public.current_role() = 'admin_manager'
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
    and (public.is_admin() or public.current_role() = 'admin_manager' or public.current_role() = 'assistant')
  );

drop policy "staff_chat_messages_select" on staff_chat_messages;
create policy "staff_chat_messages_select"
  on staff_chat_messages for select
  to authenticated
  using (
    (conversation_id = '00000000-0000-0000-0000-000000000001'::uuid and public.current_role() = any (array['teacher'::staff_role, 'assistant'::staff_role]))
    or public.is_group_owner(conversation_id)
    or public.is_assigned_ta(conversation_id)
    or public.is_admin()
    or public.current_role() = 'admin_manager'
  );

-- Staff management: admin_manager is now a fully protected, CEO-managed
-- role like ceo itself, never a manager of other profiles.

drop policy "profiles_update_admin" on profiles;
create policy "profiles_update_admin"
  on profiles for update
  to authenticated
  using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

-- Issues: admin_manager may still change the status of an issue assigned
-- to it (mirrors updateIssueStatusAction exactly); reassigning, editing, or
-- deleting someone else's issue stays CEO-or-creator only.

drop policy "issues_update" on issues;
create policy "issues_update"
  on issues for update
  to authenticated
  using (public.is_admin() or created_by = auth.uid() or (public.current_role() = 'admin_manager' and assigned_to = auth.uid()))
  with check (public.is_admin() or created_by = auth.uid() or (public.current_role() = 'admin_manager' and assigned_to = auth.uid()));

create or replace function public.protect_issue_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.assigned_to is distinct from old.assigned_to
    or new.voice_url is distinct from old.voice_url
    or new.created_by is distinct from old.created_by
  then
    if not public.is_admin() then
      raise exception 'Only an admin can change this field';
    end if;
  end if;

  if new.status is distinct from old.status
    or new.resolved_by is distinct from old.resolved_by
    or new.resolved_at is distinct from old.resolved_at
  then
    if not (
      public.is_admin()
      or (public.current_role() = 'admin_manager' and old.assigned_to = auth.uid())
    ) then
      raise exception 'Only an admin can change this field';
    end if;
  end if;

  return new;
end;
$$;

-- Group-specific TA assignment. Previously any assistant could see/comment
-- on every group's lessons and participate in every group's staff chat (a
-- deliberate broad-visibility precedent from the original group-management
-- rollout). This narrows that down: each group now has at most one assigned
-- Teacher Assistant, and only that TA (not every assistant) gets access to
-- the group's lessons, comments, files, and staff chat. The company-wide
-- /staff-chat room is unaffected — every teacher/assistant still sees that.
--
-- CEOs and Admin Managers can now additionally read (but not post in) a
-- group's staff chat — "monitor" access that didn't exist before, since the
-- chat was previously Teacher/TA-only with CEO/Admin explicitly excluded.

alter table groups add column assigned_ta_id uuid references profiles (id) on delete set null;

create index groups_assigned_ta_idx on groups (assigned_ta_id);

-- Mirrors is_group_owner(): is the caller the specific TA assigned to this
-- group (by group id directly, or transitively via a group-owned resource
-- id like a lesson/day/homework row's group_id)?
create or replace function public.is_assigned_ta(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from groups where id = target_group_id and assigned_ta_id = auth.uid()
  )
$$;

grant execute on function public.is_assigned_ta(uuid) to authenticated;

-- groups ----------------------------------------------------------------
drop policy "groups_select" on groups;

create policy "groups_select"
  on groups for select
  to authenticated
  using (public.is_admin() or teacher_id = auth.uid() or public.is_assigned_ta(id));

-- course_lessons ----------------------------------------------------------
drop policy "course_lessons_select" on course_lessons;

create policy "course_lessons_select"
  on course_lessons for select
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id) or public.is_assigned_ta(group_id));

-- lesson_comments -----------------------------------------------------------
drop policy "lesson_comments_select" on lesson_comments;
drop policy "lesson_comments_insert" on lesson_comments;

create policy "lesson_comments_select"
  on lesson_comments for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from course_lessons cl
      where cl.id = lesson_id and (public.is_group_owner(cl.group_id) or public.is_assigned_ta(cl.group_id))
    )
  );

create policy "lesson_comments_insert"
  on lesson_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from course_lessons cl where cl.id = lesson_id and public.is_assigned_ta(cl.group_id)
      )
    )
  );

-- lesson_materials storage ------------------------------------------------
drop policy "lesson_materials_select" on storage.objects;

create policy "lesson_materials_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (
      public.is_admin()
      or public.is_group_owner((storage.foldername(name))[1]::uuid)
      or public.is_assigned_ta((storage.foldername(name))[1]::uuid)
    )
  );

-- staff_chat_messages ---------------------------------------------------
-- Global room (fixed conversation id) stays open to every teacher/assistant.
-- A group-scoped conversation (conversation_id = a real group id) is now
-- restricted to that group's owning teacher and assigned TA, with CEO/Admin
-- granted read-only "monitor" access (select but not insert).
drop policy "staff_chat_messages_select" on staff_chat_messages;
drop policy "staff_chat_messages_insert" on staff_chat_messages;

create policy "staff_chat_messages_select"
  on staff_chat_messages for select
  to authenticated
  using (
    (conversation_id = '00000000-0000-0000-0000-000000000001'::uuid and public.current_role() in ('teacher', 'assistant'))
    or public.is_group_owner(conversation_id)
    or public.is_assigned_ta(conversation_id)
    or public.is_admin()
  );

create policy "staff_chat_messages_insert"
  on staff_chat_messages for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      (conversation_id = '00000000-0000-0000-0000-000000000001'::uuid and public.current_role() in ('teacher', 'assistant'))
      or public.is_group_owner(conversation_id)
      or public.is_assigned_ta(conversation_id)
    )
  );

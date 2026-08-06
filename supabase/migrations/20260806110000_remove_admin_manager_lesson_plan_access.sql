-- Administrative Manager loses lesson-plan visibility entirely — the
-- 20260730110000_admin_manager_role_rework.sql migration explicitly kept
-- "viewing every group's lesson plans and commenting on them" for this
-- role; that carve-out is removed here. Every policy below is otherwise
-- unchanged (still is_admin() — ceo/it_developer — or the actual
-- owner/assigned-TA/assistant), just with the
-- `or public.current_role() = 'admin_manager'` branch dropped.
drop policy "groups_select" on groups;
create policy "groups_select"
  on groups for select
  to authenticated
  using (public.is_admin() or teacher_id = auth.uid() or public.is_assigned_ta(id));

drop policy "course_lessons_select" on course_lessons;
create policy "course_lessons_select"
  on course_lessons for select
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id) or public.is_assigned_ta(group_id));

drop policy "weekly_lesson_plans_select" on weekly_lesson_plans;
create policy "weekly_lesson_plans_select"
  on weekly_lesson_plans for select
  to authenticated
  using (
    public.is_admin()
    or public.is_group_owner(group_id)
    or public.current_role() = 'assistant'
  );

drop policy "lesson_plan_days_select" on lesson_plan_days;
create policy "lesson_plan_days_select"
  on lesson_plan_days for select
  to authenticated
  using (
    public.is_admin()
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
    and (public.is_admin() or public.current_role() = 'assistant')
  );

-- Equalize CEO and Admin Manager for day-to-day operations, while locking
-- down account management of Admin accounts to the CEO alone.
--
-- Part 1: two policies from the lesson-plan overhaul deliberately excluded
-- admin_manager and granted only the CEO an override (clearing/deleting a
-- lesson file, updating a lesson row) — that carve-out predates this
-- request and is now explicitly being reversed: file/content moderation is
-- a daily operation, not an HR power, so admin_manager gets the same
-- override the CEO already had.
drop policy "lesson_materials_update" on storage.objects;
drop policy "lesson_materials_delete" on storage.objects;
drop policy "course_lessons_update" on course_lessons;

create policy "lesson_materials_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.is_admin())
  )
  with check (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.is_admin())
  );

create policy "lesson_materials_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.is_admin())
  );

create policy "course_lessons_update"
  on course_lessons for update
  to authenticated
  using (public.is_group_owner(group_id) or public.is_admin())
  with check (public.is_group_owner(group_id) or public.is_admin());

-- Part 2: profiles_update_admin previously let ANY admin (ceo or
-- admin_manager) update ANY profile row, with the only protection being an
-- application-layer check in src/lib/actions/staff.ts (not RLS itself) that
-- blocked touching a CEO's row. That left a real gap: an admin_manager
-- could update another admin_manager's row directly (e.g. via the REST API,
-- bypassing the app layer entirely). Reserving Admin-account management to
-- the CEO now needs to be enforced at the RLS level, not just in the
-- Server Action.
drop policy "profiles_update_admin" on profiles;

create policy "profiles_update_admin"
  on profiles for update
  to authenticated
  using (
    public.current_role() = 'ceo'
    or (public.current_role() = 'admin_manager' and role not in ('ceo', 'admin_manager'))
  )
  with check (
    public.current_role() = 'ceo'
    or (public.current_role() = 'admin_manager' and role not in ('ceo', 'admin_manager'))
  );

-- No DELETE policy existed on profiles at all before this (staff accounts
-- were only ever deactivated, never hard-deleted). This adds exactly the
-- capability requested — the CEO deleting an Admin account — and nothing
-- broader: it does not let the CEO delete teachers/assistants/other CEOs,
-- since that was never asked for and would be a much bigger capability to
-- introduce unprompted.
create policy "profiles_delete_admin_ceo_only"
  on profiles for delete
  to authenticated
  using (public.current_role() = 'ceo' and role = 'admin_manager');

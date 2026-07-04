-- Storage buckets: avatars (public read) and lesson-files (staff-only read).
-- Convention: objects are stored under a `${auth.uid()}/...` path so
-- ownership can be checked from the first path segment.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('lesson-files', 'lesson-files', false)
on conflict (id) do nothing;

-- avatars ------------------------------------------------------------------
create policy "avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "avatars_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins manage any staff member's avatar (e.g. editing a staff profile).
create policy "avatars_admin_manage"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());

-- lesson-files ---------------------------------------------------------------
create policy "lesson_files_staff_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'lesson-files');

create policy "lesson_files_teacher_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'lesson-files'
    and public.current_role() = 'teacher'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "lesson_files_teacher_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'lesson-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'lesson-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "lesson_files_teacher_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lesson-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

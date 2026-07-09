-- Post-Frankfurt-migration fix: storage.objects INSERT/UPDATE/DELETE
-- policies did not carry over (SELECT policies did, which is why reads
-- worked but every upload failed with "new row violates row-level security
-- policy" for every bucket — reproduced directly against the live project
-- for a real teacher session before writing this fix). Re-creates exactly
-- the same owner-scoped policies already defined in
-- 20260704052438_storage_buckets.sql, 20260706120000_course_lessons_overhaul.sql,
-- and 20260708090000_staff_chats_social_hub.sql — not broader.

-- avatars --------------------------------------------------------------
drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
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

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_admin_manage" on storage.objects;
create policy "avatars_admin_manage"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());

-- lesson_materials -------------------------------------------------------
drop policy if exists "lesson_materials_teacher_insert" on storage.objects;
create policy "lesson_materials_teacher_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'lesson_materials'
    and public.is_group_owner((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "lesson_materials_update" on storage.objects;
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

drop policy if exists "lesson_materials_delete" on storage.objects;
create policy "lesson_materials_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.current_role() = 'ceo')
  );

-- chat_media ---------------------------------------------------------------
drop policy if exists "chat_media_owner_insert" on storage.objects;
create policy "chat_media_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat_media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat_media_owner_delete" on storage.objects;
create policy "chat_media_owner_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chat_media' and (storage.foldername(name))[1] = auth.uid()::text);

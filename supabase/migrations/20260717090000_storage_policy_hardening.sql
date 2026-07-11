-- Two fixes:
--
-- 1. Re-assert the avatars bucket + its 4 RLS policies idempotently. The
--    migrations that define them (20260704052438_storage_buckets.sql,
--    20260713090000_restore_storage_write_policies.sql) look internally
--    consistent, but self-service avatar upload
--    (src/components/settings/profile-section.tsx) still depends on these
--    policies actually being live on the database, unlike every other
--    upload path in the app (which was already patched to go through the
--    service-role admin client instead). Re-running this guarantees the
--    bucket/policies exist regardless of any prior migration-history drift.
--
-- 2. Fix a real regression: 20260713090000_restore_storage_write_policies.sql
--    recreated lesson_materials_update/lesson_materials_delete using
--    `public.current_role() = 'ceo'`, silently reverting the parity fix
--    from 20260709100000_ceo_admin_rbac.sql (which had changed the same two
--    policies to `public.is_admin()` so admin_manager has equal access to
--    ceo). Restoring is_admin() here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5 * 1024 * 1024, array['image/png', 'image/jpeg'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5 * 1024 * 1024,
  allowed_mime_types = array['image/png', 'image/jpeg'];

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

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

-- lesson_materials: restore admin_manager parity ----------------------------
drop policy if exists "lesson_materials_update" on storage.objects;
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

drop policy if exists "lesson_materials_delete" on storage.objects;
create policy "lesson_materials_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.is_admin())
  );

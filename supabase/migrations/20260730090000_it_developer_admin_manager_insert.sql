-- createAdminManagerAction (src/lib/actions/staff.ts) lets an IT Developer
-- create an admin_manager account, but the profiles insert policy only
-- allowed ceo/admin_manager (is_admin()) — the app-layer check passed while
-- the RLS insert was silently rejected, so account creation always failed.
-- Mirrors that same narrow carve-out here: it_developer may insert only a
-- row whose role is admin_manager, nothing else.
drop policy "profiles_insert_admin" on profiles;

create policy "profiles_insert_admin"
  on profiles for insert
  to authenticated
  with check (
    public.is_admin()
    or (public.current_role() = 'it_developer' and role = 'admin_manager')
  );

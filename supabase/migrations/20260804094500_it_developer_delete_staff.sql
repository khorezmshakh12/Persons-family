-- Full delete, not just deactivate — IT Developer gets the same
-- irreversible staff-deletion power as CEO, with the same protected-role
-- carve-out used everywhere else in the elevation: still cannot delete a
-- ceo or admin_manager account (that stays exclusively CEO's, alongside
-- transferring the CEO role and managing an admin_manager account via
-- admin-management.ts).
drop policy "profiles_delete_ceo" on profiles;
create policy "profiles_delete_admin"
  on profiles for delete
  to authenticated
  using (
    id <> auth.uid()
    and (
      public.current_role() = 'ceo'
      or (public.current_role() = 'it_developer' and role not in ('ceo', 'admin_manager'))
    )
  );

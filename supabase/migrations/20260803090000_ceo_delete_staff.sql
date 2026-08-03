-- CEO can permanently delete a staff member. profiles.id already cascades
-- from auth.users (see 20260704051739_schema.sql), so the actual delete path
-- is admin.auth.admin.deleteUser() via the service-role client — same
-- pattern as every other staff-management action in staff.ts. This policy
-- is defense-in-depth for that path and for any direct-table delete, not
-- the primary enforcement (which lives in requireCeo() server-side).
--
-- Self-delete is blocked at this layer too, mirroring toggleStaffActiveAction's
-- existing 'cannotDeactivateSelf' guard — a CEO can't lock themselves out by
-- deleting their own account.
create policy "profiles_delete_ceo"
  on profiles for delete
  to authenticated
  using (public.current_role() = 'ceo' and id <> auth.uid());

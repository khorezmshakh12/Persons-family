-- Issues could be soft-"deleted" from the Done column in the UI already,
-- but no RLS delete policy existed, so the delete silently matched zero
-- rows (RLS-blocked deletes look identical to "no matching row" — no
-- error, no exception) and the row stayed in the table.
create policy "issues_delete_admin"
  on issues for delete
  to authenticated
  using (public.is_admin());

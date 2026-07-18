-- Company news could be deleted from the UI, but no RLS delete policy
-- existed, so the delete would silently match zero rows (RLS-blocked
-- deletes look identical to "no matching row" — no error, no exception)
-- and the row would stay in the table. Mirrors issues_delete: an admin, or
-- the post's own author, can delete it.
create policy "company_news_delete"
  on company_news for delete
  to authenticated
  using (public.is_admin() or created_by = auth.uid());

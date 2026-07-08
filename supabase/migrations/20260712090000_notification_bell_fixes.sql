-- The notification bell's Realtime subscription on `issues` never fired:
-- the table was never added to the supabase_realtime publication, so
-- INSERT/UPDATE events (e.g. mark_issues_seen() flipping is_seen) never
-- reached connected clients. Mirrors the staff_chats setup exactly.
alter table issues replica identity full;
alter publication supabase_realtime add table issues;

-- Per-issue counterpart to mark_issues_seen(): lets the notification bell
-- mark just the one issue a user clicked on as seen (optimistic-UI click),
-- the same way mark_conversation_read() is scoped to a single sender
-- instead of a user's whole inbox.
create or replace function public.mark_issue_seen(issue_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update issues set is_seen = true where id = issue_id and assigned_to = auth.uid() and is_seen = false;
$$;

grant execute on function public.mark_issue_seen(uuid) to authenticated;

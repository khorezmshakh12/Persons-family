-- Persons ERP v1.4 Phase 2 — CEO evaluation score + issue "seen" tracking
-- for the notification bell. (teacher_level already has the exact
-- 'C'..'A++' 9-value enum from the Phase 1 migration — nothing to change
-- there, just confirming it here.)

alter table self_development add column ceo_score integer check (ceo_score between 1 and 100);

-- Mirrors staff_chats.is_read: a per-issue "has the assignee seen this"
-- flag, driving the notification bell's task count. Defaults false so a
-- freshly-assigned issue is "new" until the assignee visits /issues.
alter table issues add column is_seen boolean not null default false;

-- Defensive: if an issue is ever reassigned to someone else (no UI does
-- this today, but the column should stay correct regardless), the new
-- assignee should see it as new again.
create or replace function public.reset_issue_seen_on_reassign()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    new.is_seen = false;
  end if;
  return new;
end;
$$;

create trigger reset_issue_seen_on_reassign_trigger
  before update on issues
  for each row execute function public.reset_issue_seen_on_reassign();

-- Marks every issue assigned to the caller as seen in one statement, same
-- shape as mark_conversation_read() — a security-definer function instead
-- of a broad "assigned_to = auth.uid()" UPDATE policy, since every current
-- assignee already qualifies as is_admin() (only CEO/Administrative
-- Manager can be assigned an issue) and already has broad UPDATE rights on
-- issues via issues_update_admin; routing this through a narrow function
-- keeps "mark seen" from being a vector to change anything else on a row
-- that isn't actually assigned to them, and keeps the two "mark as seen"
-- features (chat, issues) consistent.
create or replace function public.mark_issues_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update issues set is_seen = true where assigned_to = auth.uid() and is_seen = false;
$$;

grant execute on function public.mark_issues_seen() to authenticated;

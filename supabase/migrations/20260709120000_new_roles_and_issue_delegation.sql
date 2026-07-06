-- New generic staff roles requested for Issues/Tasks-only staff who aren't
-- teachers or TAs. Adding enum values is additive and doesn't touch any
-- existing role-gated logic (nav, RLS, lesson-plans/staff-chat access stay
-- scoped to 'teacher'/'assistant' exactly as before) — these roles only
-- gain whatever every authenticated staff member already gets (Dashboard,
-- Issues, Tasks, Company News, general Chat, Settings).
alter type staff_role add value if not exists 'smm';
alter type staff_role add value if not exists 'mobilgrof';
alter type staff_role add value if not exists 'it_developer';

-- Issues: add delegation target. Chain-of-command enforcement (non-admins
-- may only assign to an Administrative Manager) lives in createIssueAction,
-- server-side — this column has no CHECK constraint of its own since the
-- rule depends on both the creator's role and the target's role together.
alter table issues add column assigned_to uuid references profiles(id);

-- The previous issues_select policy only let a non-admin see issues they
-- reported themselves. Now that issues can be assigned to someone, that
-- assignee (e.g. the Administrative Manager a teacher escalated to) also
-- needs to see it — admins already see everything via is_admin().
drop policy "issues_select" on issues;

create policy "issues_select"
  on issues for select
  to authenticated
  using (public.is_admin() or created_by = auth.uid() or assigned_to = auth.uid());

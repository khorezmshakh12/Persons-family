-- ==========================================================================
-- Checklist feedback (owner 2026-11-13): a monitor (CEO, COO, HR via
-- Section access) leaves a note on an employee's day — either on the whole
-- day (template_id null) or on one item. The employee is notified (bell +
-- Telegram) and sees it on «Mening checklistim». No replies. Additive.
-- ==========================================================================

begin;

create table if not exists checklist_feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  day          date not null,
  -- Template rows are hard-deleted; keep the note and the item's title.
  template_id  uuid references checklist_templates(id) on delete set null,
  item_title   text,
  body         text not null check (length(body) between 1 and 1000),
  author_id    uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_checklist_feedback_user_day on checklist_feedback (user_id, day desc);
create index if not exists idx_checklist_feedback_day on checklist_feedback (day);

-- HR: jamoa checklistini kuzatish + feedback.
insert into role_access (role, key, allow) values
  ('hr_manager', 'checklist.monitor', true),
  ('hr_manager', 'checklist.feedback', true)
on conflict (role, key) do nothing;

commit;

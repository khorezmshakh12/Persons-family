-- Spec #4: a one-time "2 hours to deadline" Telegram nudge to the assignee.
-- `deadline_reminder_sent_at` is stamped once so the cron never repeats it.
begin;

alter table tasks add column if not exists deadline_reminder_sent_at timestamptz;

create index if not exists tasks_deadline_reminder_idx
  on tasks (deadline)
  where deadline_reminder_sent_at is null and status <> 'done';

commit;

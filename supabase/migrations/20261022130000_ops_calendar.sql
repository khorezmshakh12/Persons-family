-- Operation HQ › Kalendar (2026-10-22): holidays (no lessons), exams,
-- make-up lessons (otrabotka) and other days the schedule must know about.
begin;

create table if not exists ops_calendar (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  kind text not null default 'event'
    check (kind in ('holiday', 'exam', 'makeup', 'event')),
  title text not null check (length(title) between 1 and 200),
  group_id uuid references groups(id) on delete set null,
  time text check (time is null or time ~ '^\d{2}:\d{2}$'),
  room text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ops_calendar_day_idx on ops_calendar (day);

commit;

-- Lesson plans v2: a head teacher's review of a plan (plus Jev's advisory
-- quality score), and a per-group daily snapshot the nightly compliance
-- cron writes at the deadline so the Intizom grid shows on-time status,
-- not "filled in later".
begin;

create table if not exists lesson_reviews (
  lesson_id     uuid primary key references course_lessons(id) on delete cascade,
  reviewer      uuid references profiles(id) on delete set null,
  verdict       text check (verdict in ('ok', 'needs_work')),
  note          text check (char_length(note) <= 2000),
  ai_score      smallint check (ai_score between 1 and 5),
  ai_checked_at timestamptz,
  reviewed_at   timestamptz
);

create table if not exists lesson_plan_daily (
  date_key   date not null,
  group_id   uuid not null references groups(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete set null,
  status     text not null check (status in ('complete', 'incomplete', 'missing')),
  primary key (date_key, group_id)
);
create index if not exists lesson_plan_daily_teacher_idx on lesson_plan_daily (teacher_id, date_key);

commit;

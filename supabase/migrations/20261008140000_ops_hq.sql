-- Operation HQ v2: room equipment, an audit log of schedule moves (also the
-- source for undo), and teachers' working windows per cohort. A group's
-- lesson length lives in groups.configuration->>'duration' (minutes).
begin;

alter table ops_rooms add column if not exists features text[] not null default '{}';

create table if not exists ops_schedule_log (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  actor      uuid references profiles(id) on delete set null,
  before     jsonb not null,
  after      jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists ops_schedule_log_created_idx on ops_schedule_log (created_at desc);

create table if not exists ops_teacher_availability (
  teacher_id uuid not null references profiles(id) on delete cascade,
  cohort     text not null check (cohort in ('odd', 'even')),
  start_time text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time   text not null check (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  primary key (teacher_id, cohort, start_time)
);

commit;

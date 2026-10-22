-- Operation HQ › Bugun (2026-10-22): a substitute teacher for one group on
-- one Tashkent day — set when the group's own teacher is absent or late.
begin;

create table if not exists ops_substitutions (
  day date not null,
  group_id uuid not null references groups(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (day, group_id)
);

create index if not exists ops_substitutions_teacher_day_idx on ops_substitutions (teacher_id, day);

commit;

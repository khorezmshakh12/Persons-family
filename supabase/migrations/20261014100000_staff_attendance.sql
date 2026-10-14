-- Xodimlar davomati (2026-10-14): one row per employee per Tashkent day.
-- No row = nothing marked yet (shown as "Kelmadi"). Staff come from
-- profiles — the section never adds people of its own. Only the CEO, COO
-- and Administrative Manager write here (SECTION_ROLES.attendance).
begin;

create table if not exists staff_attendance (
  profile_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  check_in text check (check_in is null or check_in ~ '^\d{2}:\d{2}$'),
  check_out text check (check_out is null or check_out ~ '^\d{2}:\d{2}$'),
  status text not null default 'absent'
    check (status in ('office', 'late', 'remote', 'left', 'absent')),
  note text not null default '',
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, day)
);

create index if not exists staff_attendance_day_idx on staff_attendance (day);

commit;

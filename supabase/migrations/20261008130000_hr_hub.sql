-- HR hub: employment dates on the profile (tenure, probation reminders,
-- work anniversaries) and onboarding checklists for new staff. Leave,
-- hiring and month-end bonus stay in Core (core_state) untouched.
begin;

alter table profiles
  add column if not exists hire_date date,
  add column if not exists probation_until date;

create table if not exists onboarding_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  sort       integer not null default 0,
  done_at    timestamptz,
  done_by    uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists onboarding_items_user_idx on onboarding_items (user_id, sort);

commit;

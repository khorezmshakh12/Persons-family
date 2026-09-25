-- ==========================================================================
-- Persons Perforce — real data for the parts of the prototype that had no
-- table yet:
--   * pf_sprint_goals       — the goal of each 14-day sprint (Sprint tab)
--   * pf_test_cases         — ALM test cases traced to a Strategy task
--                             (requirement); a failed run opens a linked
--                             issue in `issues`
--   * pf_change_requests    — internal change-request / review log
--     (+ pf_cr_comments, pf_cr_votes) — the "Depot & code review" tab
--     (GitHub / a VCS is not wired, so reviews are recorded here)
-- Author FKs are `on delete set null` so removing a staff profile never
-- trips over them (see lib/staff-removal.ts).
-- Additive / IF NOT EXISTS, safe to re-run.
-- ==========================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists pf_sprint_goals (
  sprint_no   int primary key check (sprint_no > 0),
  goal        text not null check (char_length(goal) between 1 and 300),
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table if not exists pf_test_cases (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references strategy_spaces(id) on delete cascade,
  stask_id    uuid references strategy_tasks(id) on delete set null,
  title       text not null check (char_length(title) between 1 and 300),
  result      text not null default 'none' check (result in ('pass', 'fail', 'blocked', 'none')),
  issue_id    uuid references issues(id) on delete set null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  run_at      timestamptz
);
create index if not exists pf_test_cases_space_idx on pf_test_cases (space_id);
create index if not exists pf_test_cases_stask_idx on pf_test_cases (stask_id);

create table if not exists pf_change_requests (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid references strategy_spaces(id) on delete set null,
  stask_id     uuid references strategy_tasks(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 300),
  description  text not null default '' check (char_length(description) <= 5000),
  status       text not null default 'needs' check (status in ('needs', 'review', 'approved', 'rejected', 'submitted')),
  author_id    uuid references profiles(id) on delete set null,
  decided_by   uuid references profiles(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists pf_change_requests_created_idx on pf_change_requests (created_at desc);

create table if not exists pf_cr_comments (
  id          uuid primary key default gen_random_uuid(),
  cr_id       uuid not null references pf_change_requests(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists pf_cr_comments_cr_idx on pf_cr_comments (cr_id, created_at);

create table if not exists pf_cr_votes (
  cr_id       uuid not null references pf_change_requests(id) on delete cascade,
  voter_id    uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (cr_id, voter_id)
);

commit;

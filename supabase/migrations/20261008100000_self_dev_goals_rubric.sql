-- Self-development v2: a goal set at the start of the month, a structured
-- report (kind, hours, evidence link), a three-criterion rubric the CEO
-- fills next to the (still unbounded) score, and Jev's rubric suggestion.
begin;

alter table self_development
  add column if not exists kind text check (kind in ('course', 'book', 'skill', 'practice', 'other')),
  add column if not exists hours numeric check (hours >= 0 and hours <= 744),
  add column if not exists evidence_url text check (char_length(evidence_url) <= 500),
  -- { depth, applied, evidence } — each 1..5, set by the reviewer.
  add column if not exists rubric jsonb,
  -- Jev's suggestion for the same three criteria (+ confidence), advisory only.
  add column if not exists ai_rubric jsonb,
  add column if not exists ai_checked_at timestamptz;

create table if not exists self_dev_goals (
  user_id    uuid not null references profiles(id) on delete cascade,
  month      date not null check (extract(day from month) = 1),
  goal       text not null check (char_length(goal) between 3 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

commit;

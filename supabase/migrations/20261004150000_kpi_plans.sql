-- My KPI: every employee files next month's plan in three scenarios
-- (yomon / yaxshi / juda yaxshi) by the last day of the month, 23:59
-- Tashkent. The CEO approves it (setting each scenario's % of the salary)
-- or returns it; at month end the employee self-assesses and the CEO grades
-- the scenario reached — that grade posts a finance_entries row (bonus or
-- deduction) for the month, so it lands in the payroll ledger.
begin;

create table if not exists kpi_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  month           date not null check (extract(day from month) = 1),
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'returned', 'approved')),
  -- Full narrative per scenario: { bad: { summary }, good: { summary }, great: { summary } }
  scenarios       jsonb not null default '{}'::jsonb,
  submitted_at    timestamptz,
  review_note     text,
  reviewed_by     uuid references profiles(id) on delete set null,
  reviewed_at     timestamptz,
  pct_bad         numeric not null default -10,
  pct_good        numeric not null default 0,
  pct_great       numeric not null default 15,
  self_result     text check (self_result in ('bad', 'good', 'great')),
  self_note       text,
  self_at         timestamptz,
  grade           text check (grade in ('bad', 'good', 'great')),
  grade_pct       numeric,
  grade_amount    numeric,
  grade_note      text,
  graded_by       uuid references profiles(id) on delete set null,
  graded_at       timestamptz,
  finance_entry_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, month)
);
create index if not exists kpi_plans_month_idx on kpi_plans (month, status);

create table if not exists kpi_items (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references kpi_plans(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  kind          text not null default 'number' check (kind in ('number', 'money', 'percent', 'projects', 'text')),
  unit          text not null default '' check (char_length(unit) <= 20),
  target_bad    text not null default '' check (char_length(target_bad) <= 2000),
  target_good   text not null default '' check (char_length(target_good) <= 2000),
  target_great  text not null default '' check (char_length(target_great) <= 2000),
  actual        text not null default '' check (char_length(actual) <= 2000),
  sort_order    integer not null default 0
);
create index if not exists kpi_items_plan_idx on kpi_items (plan_id, sort_order);

-- Which reminders already went out (deadline −5 days, last day, CEO digest).
create table if not exists kpi_reminders (
  month     date not null,
  kind      text not null check (kind in ('early', 'last', 'digest')),
  sent_at   timestamptz not null default now(),
  primary key (month, kind)
);

commit;

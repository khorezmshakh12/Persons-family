-- Strategiya → Moliya / Tahlil: the inputs the prototype's six learning-centre
-- metrics need that the books do not hold (head-counts per month, overdue
-- student debts), plus roadmap node resource links. Additive and idempotent.
begin;

-- One row per month: students on the books, how many paid this month, new
-- enrolments (null = count Operatsiya HQ leads), and the capacity (rooms × seats × shifts) at the time of saving.
create table if not exists strategy_fin_months (
  ym            text primary key check (ym ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  students      integer check (students >= 0),
  paid          integer not null default 0 check (paid >= 0),
  new_students  integer check (new_students >= 0),
  capacity      integer check (capacity >= 0),
  updated_by    uuid references profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);

-- Students whose payment is overdue. Days late = today (Tashkent) − due_date.
create table if not exists strategy_debtors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  phone       text not null default '',
  course_id   uuid references acct_courses(id) on delete set null,
  grp         text not null default '',
  amount      numeric(14, 2) not null check (amount > 0),
  due_date    date not null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists strategy_debtors_due_idx on strategy_debtors (due_date);

-- Roadmap node resources: { nodeId: [{ k: 'DOC'|'SHEET'|'LINK', t, url }] }.
alter table strategy_roadmaps add column if not exists node_links jsonb not null default '{}'::jsonb;

commit;

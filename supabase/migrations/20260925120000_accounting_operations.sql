-- ==========================================================================
-- Strategy suite, part 2: Hisob-kitob (double-entry accounting), course
-- economics, lead funnel, and task completion stamps for the Perforce view.
--
-- Everything the prototype showed with sample numbers is computed here from
-- real rows: the journal (acct_entries) is the single source for every
-- ledger / statement / cash / budget-vs-actual figure; payroll and
-- depreciation are posted into it from real data by the app, idempotently
-- (acct_entries.source is unique). No sample money is seeded — only the
-- chart of accounts and the tax-rate defaults.
--
-- Additive / IF NOT EXISTS, safe to re-run.
-- ==========================================================================

begin;

create table if not exists acct_accounts (
  code  text primary key,
  name  text not null,
  -- A asset · CA contra-asset · L liability · E equity · R revenue · X expense
  type  text not null check (type in ('A', 'CA', 'L', 'E', 'R', 'X')),
  sort  int not null default 0
);

insert into acct_accounts (code, name, type, sort) values
  ('0100', 'Asosiy vositalar', 'A', 10),
  ('0200', 'Asosiy vositalar eskirishi', 'CA', 20),
  ('2910', 'Darsliklar va materiallar', 'A', 30),
  ('4010', 'O''quvchilardan olinadigan (debitorlik)', 'A', 40),
  ('5010', 'Kassa (milliy valyuta)', 'A', 50),
  ('5110', 'Hisob-kitob schyoti (bank)', 'A', 60),
  ('6010', 'Yetkazib beruvchilarga qarz', 'L', 70),
  ('6310', 'Olingan bo''naklar (oldindan to''lov)', 'L', 80),
  ('6410', 'Budjetga soliqlar bo''yicha qarz', 'L', 90),
  ('6520', 'Ijtimoiy soliq bo''yicha qarz', 'L', 100),
  ('6710', 'Mehnat haqi bo''yicha qarz', 'L', 110),
  ('8300', 'Ustav kapitali', 'E', 120),
  ('8710', 'Taqsimlanmagan foyda', 'E', 130),
  ('9030', 'Ta''lim xizmatlaridan daromad', 'R', 140),
  ('9130', 'Ko''rsatilgan xizmatlar tannarxi', 'X', 150),
  ('9410', 'Sotish (marketing) xarajatlari', 'X', 160),
  ('9420', 'Ma''muriy xarajatlar', 'X', 170),
  ('9430', 'Boshqa operatsion xarajatlar', 'X', 180),
  ('9810', 'Soliq xarajatlari (aylanma soliq)', 'X', 190)
on conflict (code) do nothing;

-- Opening balances (as of the day the books start). Stored in the account's
-- natural direction: debit-normal (A, X) as a debit, the rest as a credit.
create table if not exists acct_opening (
  code        text primary key references acct_accounts(code),
  amount      numeric(16, 2) not null default 0 check (amount >= 0),
  updated_at  timestamptz not null default now()
);

create table if not exists acct_entries (
  id           uuid primary key default gen_random_uuid(),
  entry_date   date not null,
  doc          text not null default '' check (char_length(doc) <= 40),
  description  text not null check (char_length(description) between 1 and 300),
  debit        text not null references acct_accounts(code),
  credit       text not null references acct_accounts(code),
  amount       numeric(16, 2) not null check (amount > 0),
  -- Set for app-generated postings (payroll:2026-09:..., depr:2026-09, …) so
  -- re-posting a month replaces its rows instead of duplicating them.
  source       text unique,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (debit <> credit)
);
create index if not exists acct_entries_date_idx on acct_entries (entry_date);

create table if not exists acct_assets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 200),
  category    text not null default '',
  cost        numeric(16, 2) not null check (cost > 0),
  acquired    date not null,
  life_years  int not null check (life_years between 1 and 50),
  disposed    date,
  created_at  timestamptz not null default now()
);

create table if not exists acct_budget (
  period  date not null,
  code    text not null references acct_accounts(code),
  amount  numeric(16, 2) not null check (amount >= 0),
  primary key (period, code)
);

create table if not exists acct_settings (
  key    text primary key,
  value  jsonb not null
);
-- Rates in percent. Defaults = the prototype's 2026 figures; editable in the
-- app (the accountant confirms them).
insert into acct_settings (key, value) values
  ('tax', '{"turnover":4,"pit":12,"social":12,"profit":15,"vat":12,"regime":"turn","vatExempt":true,"minCash":30000000}'::jsonb)
on conflict (key) do nothing;

-- Per-course monthly economics (fee, head-count, direct costs) — the input
-- for cost & margin, break-even and the scenario model.
create table if not exists acct_courses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  fee           numeric(14, 2) not null default 0 check (fee >= 0),
  students      int not null default 0 check (students >= 0),
  teacher_cost  numeric(14, 2) not null default 0 check (teacher_cost >= 0),
  book_cost     numeric(14, 2) not null default 0 check (book_cost >= 0),
  sort_order    int not null default 0,
  updated_at    timestamptz not null default now()
);

create table if not exists ops_leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  phone        text not null default '',
  source       text not null default 'instagram'
               check (source in ('instagram', 'telegram', 'referral', 'walkin', 'website', 'other')),
  course       text not null default '',
  stage        text not null default 'new'
               check (stage in ('new', 'contacted', 'trial', 'enrolled', 'lost')),
  note         text not null default '',
  owner_id     uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  enrolled_at  timestamptz
);
create index if not exists ops_leads_created_idx on ops_leads (created_at);

alter table strategy_tasks add column if not exists done_at timestamptz;
update strategy_tasks set done_at = updated_at where status = 'done' and done_at is null;

commit;

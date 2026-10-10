-- ==========================================================================
-- Payroll v5: a monthly pay run with a period lock, advance requests and an
-- audit trail.
--
--   pay_runs         one row per Tashkent month: draft → review → approved
--                    → paid. `snapshot` freezes every line at approval so a
--                    later drift is visible.
--   pay_run_log      who moved the run, when, and why (reopen needs a reason).
--   advance_requests staff ask, the CEO decides; an approved request becomes a
--                    finance_entries 'advance' row, which already reduces the
--                    month's remaining pay (see 20260908130000_salary_payroll).
--
-- The lock lives in the database, not only in the actions: while a month's
-- run is approved or paid, finance_entries / salary_months rows for that
-- period cannot be inserted, changed or deleted — except entries the pay run
-- itself writes (source 'payrun') and explicit corrections (source
-- 'correction', which must carry a reason). Errors raise 'period_locked'.
--
-- Self-contained, additive, safe to re-run.
-- ==========================================================================

begin;

create table if not exists pay_runs (
  period       date primary key,
  status       text not null default 'draft' check (status in ('draft', 'review', 'approved', 'paid')),
  snapshot     jsonb,
  note         text,
  approved_by  uuid references profiles(id) on delete set null,
  approved_at  timestamptz,
  paid_by      uuid references profiles(id) on delete set null,
  paid_at      timestamptz,
  updated_at   timestamptz not null default now()
);

create table if not exists pay_run_log (
  id         uuid primary key default gen_random_uuid(),
  period     date not null,
  actor      uuid references profiles(id) on delete set null,
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_pay_run_log_period on pay_run_log (period, created_at desc);

create table if not exists advance_requests (
  id               uuid primary key default gen_random_uuid(),
  staff_id         uuid not null references profiles(id) on delete cascade,
  amount           numeric not null check (amount > 0),
  reason           text not null,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  period           date not null,
  decided_by       uuid references profiles(id) on delete set null,
  decided_at       timestamptz,
  decision_note    text,
  finance_entry_id uuid,
  created_at       timestamptz not null default now()
);
create index if not exists idx_advance_requests_staff on advance_requests (staff_id, created_at desc);
create index if not exists idx_advance_requests_pending on advance_requests (status) where status = 'pending';

-- Where a ledger row came from: hand entry, KPI grade, the pay run, an
-- approved advance, or a correction to a locked month.
alter table finance_entries add column if not exists source text not null default 'manual';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'finance_entries_source_check') then
    alter table finance_entries
      add constraint finance_entries_source_check
      check (source in ('manual', 'kpi', 'payrun', 'advance', 'correction'));
  end if;
end $$;

-- FOR SHARE: a ledger write waits for an in-flight approval of the same
-- month (which holds the row FOR UPDATE) instead of slipping past it.
create or replace function payroll_period_locked(p date) returns boolean
language sql volatile as $$
  select coalesce((select status in ('approved', 'paid') from pay_runs where period = p for share), false)
$$;

create or replace function finance_entries_lock_guard() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.period is not null and payroll_period_locked(old.period) then
    raise exception 'period_locked' using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.period is not null and payroll_period_locked(new.period) then
    if not (tg_op = 'INSERT' and new.source in ('payrun', 'correction')) then
      raise exception 'period_locked' using errcode = 'P0001';
    end if;
    if new.source = 'correction' and coalesce(trim(new.note), '') = '' then
      raise exception 'correction_needs_reason' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_finance_entries_lock on finance_entries;
create trigger trg_finance_entries_lock
  before insert or update or delete on finance_entries
  for each row execute function finance_entries_lock_guard();

create or replace function salary_months_lock_guard() returns trigger
language plpgsql as $$
begin
  if (tg_op in ('UPDATE', 'DELETE') and payroll_period_locked(old.period))
     or (tg_op in ('INSERT', 'UPDATE') and payroll_period_locked(new.period)) then
    raise exception 'period_locked' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_salary_months_lock on salary_months;
create trigger trg_salary_months_lock
  before insert or update or delete on salary_months
  for each row execute function salary_months_lock_guard();

-- Monday team report + saved custom reports (Hisobotlar).
create table if not exists saved_reports (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  name       text not null,
  config     jsonb not null,
  shared     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_saved_reports_owner on saved_reports (owner_id);

create table if not exists report_notes (
  id         uuid primary key default gen_random_uuid(),
  metric     text not null,
  week       date not null,
  body       text not null,
  author_id  uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_report_notes_week on report_notes (week);

-- Profile: skills, 1:1 meetings, private CEO notes.
create table if not exists profile_skills (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references profiles(id) on delete cascade,
  name        text not null,
  level       int not null default 2 check (level between 1 and 5),
  verified_by uuid references profiles(id) on delete set null,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (staff_id, name)
);

create table if not exists one_on_ones (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references profiles(id) on delete cascade,
  lead_id    uuid not null references profiles(id) on delete cascade,
  held_on    date not null,
  agenda     text not null default '',
  notes      text not null default '',
  mood       int check (mood between 1 and 5),
  task_ids   uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_one_on_ones_staff on one_on_ones (staff_id, held_on desc);

create table if not exists staff_private_notes (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references profiles(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_staff_private_notes_staff on staff_private_notes (staff_id, created_at desc);

alter table profiles add column if not exists bio text;

commit;

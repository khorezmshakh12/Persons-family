-- ==========================================================================
-- Structured payroll on top of the free-form finance_entries ledger.
--
-- The CEO sets a target GROSS salary per staff member per Tashkent month
-- (salary_months). Actual money paid out is still a finance_entries row, now
-- tagged with a `kind` (salary / advance / penalty) and the month it counts
-- against, so per month:
--
--   paid      = sum(finance_entries.amount) for kind in ('salary','advance')
--   remaining = salary_months.gross_amount - paid
--
-- An advance is just a `kind='advance'` payment — it reduces `remaining`
-- exactly like a salary payment does. A penalty is a negative entry the CEO
-- records from Finance; it does not reduce the payroll the CEO still owes,
-- it feeds the net-earnings total the same as any other finance entry.
--
-- Applied by `npm run migrate`. Self-contained, additive, IF NOT EXISTS
-- throughout, safe to re-run.
-- ==========================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists salary_months (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references profiles(id) on delete cascade,
  -- First day of the month, in the Asia/Tashkent sense (the app always
  -- passes 'YYYY-MM-01').
  period       date not null,
  gross_amount numeric not null default 0,
  set_by       uuid references profiles(id) on delete set null,
  set_at       timestamptz not null default now(),
  unique (staff_id, period)
);

create index if not exists idx_salary_months_period on salary_months (period);

-- finance_entries predates the migration runner; extend it in place.
alter table finance_entries add column if not exists kind   text not null default 'adjustment';
alter table finance_entries add column if not exists period date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'finance_entries_kind_check'
  ) then
    alter table finance_entries
      add constraint finance_entries_kind_check
      check (kind in ('adjustment', 'salary', 'advance', 'penalty'));
  end if;
end $$;

create index if not exists idx_finance_entries_staff_period
  on finance_entries (staff_id, period);

commit;

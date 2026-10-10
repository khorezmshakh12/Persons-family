-- ==========================================================================
-- Payroll lock, completed (finance audit 2026-10-10).
--
-- 20261009130000_payroll_runs locked only finance_entries and salary_months.
-- A month's payable also counts rag‘bat/jarima (performance_entries, dated by
-- created_at) and the o‘zini rivojlantirish bonus (self_development.month),
-- so an approved month could still move under the CEO's feet.
--
--   * performance_entries: a row created after its month was approved is not
--     blocked — the pay engine rolls it into the next open month
--     (lib/pay-run.ts effectivePeriod). Changing or deleting a row that a
--     locked month already counted raises 'period_locked'.
--   * self_development: the bonus of a locked month cannot change.
--   * finance_entries: a row inserted without a period is stamped with the
--     current Tashkent month, so no ledger write can slip past the lock (and
--     every new row reaches the pay run).
--
-- Self-contained, additive, safe to re-run.
-- ==========================================================================

begin;

-- The month a dated movement is paid in: its own Tashkent month, or — when
-- that month was approved before the movement happened — the next one.
-- Mirrors effectivePeriod() in src/lib/pay-run.ts.
create or replace function payroll_effective_period(ts timestamptz) returns date
language plpgsql stable as $$
declare
  m date := date_trunc('month', ts at time zone 'Asia/Tashkent')::date;
  r record;
  i int := 0;
begin
  loop
    select status, approved_at into r from pay_runs where period = m;
    exit when not found
      or r.status not in ('approved', 'paid')
      or r.approved_at is null
      or ts <= r.approved_at
      or i >= 12;
    m := (m + interval '1 month')::date;
    i := i + 1;
  end loop;
  return m;
end $$;

create or replace function finance_entries_lock_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.period is null then
    new.period := date_trunc('month', now() at time zone 'Asia/Tashkent')::date;
  end if;
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

create or replace function performance_entries_lock_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and (new.amount, new.entry_type, new.staff_id, new.created_at)
                              is distinct from (old.amount, old.entry_type, old.staff_id, old.created_at)) then
    if payroll_period_locked(payroll_effective_period(old.created_at)) then
      raise exception 'period_locked' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.created_at is distinct from old.created_at
     and payroll_period_locked(payroll_effective_period(new.created_at)) then
    raise exception 'period_locked' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_performance_entries_lock on performance_entries;
create trigger trg_performance_entries_lock
  before update or delete on performance_entries
  for each row execute function performance_entries_lock_guard();

create or replace function self_development_lock_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(old.bonus_amount, 0) <> 0 and payroll_period_locked(old.month::date) then
    raise exception 'period_locked' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.bonus_amount is distinct from old.bonus_amount
     and (payroll_period_locked(old.month::date) or payroll_period_locked(new.month::date)) then
    raise exception 'period_locked' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_self_development_lock on self_development;
create trigger trg_self_development_lock
  before update or delete on self_development
  for each row execute function self_development_lock_guard();

commit;

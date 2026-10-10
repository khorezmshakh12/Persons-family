-- ==========================================================================
-- Payroll: overpayment carry-forward and one-click reversals.
--
--   * source 'carry'  — when a paid month ends overpaid (paid > payable), the
--     pay run writes the excess as a deduction into the next month, tagged
--     with `carry_from` = the overpaid month. Re-settling or undoing that
--     month's payment replaces / removes exactly these rows.
--   * reversal_of     — a correction that cancels one component of a locked
--     month ('fe:<id>' ledger row, 'perf:<id>', 'sd:<id>', 'ms:<id>'). The
--     unique index makes reversing the same item twice impossible, even
--     with two clicks in flight.
--
-- Self-contained, additive, safe to re-run.
-- ==========================================================================

begin;

alter table finance_entries add column if not exists carry_from date;
alter table finance_entries add column if not exists reversal_of text;

alter table finance_entries drop constraint if exists finance_entries_source_check;
alter table finance_entries
  add constraint finance_entries_source_check
  check (source in ('manual', 'kpi', 'payrun', 'advance', 'correction', 'carry'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'finance_entries_carry_shape') then
    alter table finance_entries
      add constraint finance_entries_carry_shape
      check ((source = 'carry') = (carry_from is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'finance_entries_reversal_shape') then
    alter table finance_entries
      add constraint finance_entries_reversal_shape
      check (reversal_of is null or (source = 'correction' and reversal_of ~ '^(fe|perf|sd|ms):[0-9a-f-]{36}$'));
  end if;
end $$;

create unique index if not exists uq_finance_entries_reversal_of
  on finance_entries (reversal_of) where reversal_of is not null;
create index if not exists idx_finance_entries_carry_from
  on finance_entries (carry_from) where carry_from is not null;

commit;

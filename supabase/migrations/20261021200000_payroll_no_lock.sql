-- ==========================================================================
-- Payroll without a month lock (owner, 2026-10-21: "oylikni ochish va
-- yopishni o'chirib tashla").
--
-- Every payroll month stays editable: the lock triggers on finance_entries,
-- salary_months, performance_entries and self_development all ask
-- payroll_period_locked(), which now always answers false. The triggers are
-- kept (harmless) so the history of migrations stays linear.
--
-- Months that were approved / paid go back to 'draft'. Payments already made
-- are ordinary ledger rows and stay as they are.
--
-- Self-contained, safe to re-run.
-- ==========================================================================

begin;

create or replace function payroll_period_locked(p date) returns boolean
language sql stable as $$
  select false
$$;

update pay_runs set status = 'draft', approved_at = null, approved_by = null, updated_at = now()
where status in ('approved', 'paid');

commit;

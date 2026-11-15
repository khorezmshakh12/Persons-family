-- Finance: October 2026 reset (owner, 2026-11-16: "oktabr oyi uchun kiritilgan
-- ma'lumotlar xato, o'chirib tashla to'liq" — option C: everything, automatic
-- bonuses and Buxgalteriya's October Kirim-chiqim included).
--
-- Removed (October = period 2026-10-01, or a date in Tashkent October):
--   * salary_months, finance_entries (avans, oylik to'lov, bonus, jarima, KPI,
--     carry, corrections) + their pay_receipts, split-advance groups that
--     started in October, November carry rows computed from October, and
--     corrections elsewhere that cancel an October row;
--   * performance_entries (rag'bat / jarima);
--   * self_development.bonus_amount and missions.bonus_amount → null (the
--     self-dev and mission records themselves stay — only their money goes);
--   * pay_runs, pay_run_log, payroll_avans_flags, advance_requests,
--     reimbursements of October;
--   * acct_entries dated October, and any payroll / payment posting for
--     October whatever its date; October's acct_periods close is reopened.
-- Not touched: Operations (crm_payments, crm_expenses, crm_teacher_payroll),
-- Strategy (strategy_fin_months), B-nuqta targets, other months.
-- Every row is copied to finance_month_fix (fix = 'oct_reset_2026_10') first.
-- Runs once.

begin;

do $$
declare
  fix_key constant text := 'oct_reset_2026_10';
  oct     constant date := '2026-10-01';
  t0      constant timestamptz := '2026-10-01 00:00+05';
  t1      constant timestamptz := '2026-11-01 00:00+05';
  n int;
begin
  if exists (select 1 from finance_month_fix where fix = fix_key) then
    raise notice 'October reset already applied';
    return;
  end if;

  -- Ledger rows to drop: October's own, whole split-advance groups that
  -- touch October, carry built from October, and reversals of any of them.
  create temp table oct_fe on commit drop as
  select id from finance_entries
  where period = oct
     or carry_from = oct
     or group_id in (select group_id from finance_entries where period = oct and group_id is not null);
  insert into oct_fe
  select fe.id from finance_entries fe
  where fe.reversal_of is not null and fe.id not in (select id from oct_fe) and (
       fe.reversal_of in (select 'fe:' || id from oct_fe)
    or fe.reversal_of in (select 'perf:' || id from performance_entries where period = oct)
    or fe.reversal_of in (select 'sd:' || id from self_development where month = oct)
    or fe.reversal_of in (select 'ms:' || id from missions
                          where coalesce(approved_at, created_at) >= t0 and coalesce(approved_at, created_at) < t1));

  -- Backups.
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'finance_entries', fe.id, to_jsonb(fe) from finance_entries fe where fe.id in (select id from oct_fe);
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'pay_receipts', r.entry_id, to_jsonb(r) from pay_receipts r where r.entry_id in (select id from oct_fe);
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'salary_months', s.id, to_jsonb(s) from salary_months s where s.period = oct;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'performance_entries', p.id, to_jsonb(p) from performance_entries p where p.period = oct;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'self_development', s.id, jsonb_build_object('id', s.id, 'bonus_amount', s.bonus_amount)
  from self_development s where s.month = oct and s.bonus_amount is not null;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'missions', m.id, jsonb_build_object('id', m.id, 'bonus_amount', m.bonus_amount)
  from missions m where m.bonus_amount is not null
    and coalesce(m.approved_at, m.created_at) >= t0 and coalesce(m.approved_at, m.created_at) < t1;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'pay_runs', null, to_jsonb(r) from pay_runs r where r.period = oct;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'pay_run_log', l.id, to_jsonb(l) from pay_run_log l where l.period = oct;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'payroll_avans_flags', null, to_jsonb(f) from payroll_avans_flags f where f.period = oct;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'advance_requests', a.id, to_jsonb(a) from advance_requests a where a.period = oct;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'reimbursements', r.id, to_jsonb(r) from reimbursements r where r.period = oct;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'acct_entries', a.id, to_jsonb(a) from acct_entries a
  where (a.entry_date >= oct and a.entry_date < date '2026-11-01')
     or a.source like 'payroll:2026-10:%'
     or a.source in (select 'pay:2026-10:' || id from oct_fe)
     or a.source like 'pay:2026-10-%';
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'acct_periods', null, to_jsonb(p) from acct_periods p where p.month = oct;
  -- Marker, so the guard above holds even when October was already empty.
  insert into finance_month_fix (fix, tbl, row_id, row_data) values (fix_key, 'marker', null, '{}'::jsonb);

  -- Reopen October's books first (the close trigger refuses edits otherwise).
  delete from acct_periods where month = oct;

  delete from acct_entries
  where (entry_date >= oct and entry_date < date '2026-11-01')
     or source like 'payroll:2026-10:%'
     or source in (select 'pay:2026-10:' || id from oct_fe)
     or source like 'pay:2026-10-%';
  get diagnostics n = row_count; raise notice 'acct_entries: %', n;

  delete from reimbursements where period = oct;
  get diagnostics n = row_count; raise notice 'reimbursements: %', n;
  delete from finance_entries where id in (select id from oct_fe);   -- pay_receipts cascade
  get diagnostics n = row_count; raise notice 'finance_entries: %', n;
  delete from salary_months where period = oct;
  get diagnostics n = row_count; raise notice 'salary_months: %', n;
  delete from performance_entries where period = oct;
  get diagnostics n = row_count; raise notice 'performance_entries: %', n;
  update self_development set bonus_amount = null where month = oct and bonus_amount is not null;
  get diagnostics n = row_count; raise notice 'self_development bonuses cleared: %', n;
  update missions set bonus_amount = null
  where bonus_amount is not null and coalesce(approved_at, created_at) >= t0 and coalesce(approved_at, created_at) < t1;
  get diagnostics n = row_count; raise notice 'mission bonuses cleared: %', n;
  delete from pay_run_log where period = oct;
  delete from pay_runs where period = oct;
  delete from payroll_avans_flags where period = oct;
  delete from advance_requests where period = oct;
end $$;

commit;

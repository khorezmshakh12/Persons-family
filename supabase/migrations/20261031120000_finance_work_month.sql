-- Finance: ish oyi (owner, 2026-10-28 / 2026-10-31). Pay belongs to the
-- month worked and is paid in the next one. Bonus = extra income, avans =
-- salary paid ahead, so a payment typed as a bonus is turned into a salary
-- payment. Every touched row is copied to finance_month_fix first.
--
--   October 2026 (paid 2–21 Oct for September's work) → September:
--     * salary payments, advances given before 15 Oct, the one salary typed
--       as a bonus («September Closed», 14 Oct), and salary_months (October's
--       figure = what September really earned; replaces the 23 Sep plan).
--     * Stays in October (October's own work): advances from 15 Oct on,
--       «Kitob uchun», jarima and rag‘bat.
--     * The five carry rows in November were computed from the wrong month
--       and are dropped.
--   Older salaries typed as bonuses become salary payments of their work
--   month, with salary_months = the amount paid (so the month nets to 0):
--     * «July Salary» (paid 11 Aug) → July.
--     * «Avgust oylik» (Aug) and the three paid 2–9 Sep → August.
--   Journal: pay:<period>:<id> keys follow their payments; converted rows
--   get their cash posting; October's accrual is dropped (re-post September
--   from Buxgalteriya).
-- Only rows created before this fix was written are touched. Runs once.

begin;

create table if not exists finance_month_fix (
  id         uuid primary key default gen_random_uuid(),
  fix        text not null,
  tbl        text not null,
  row_id     uuid,
  row_data   jsonb not null,
  created_at timestamptz not null default now()
);

do $$
declare
  fix_key constant text := 'work_month_2026_10';
  cutoff  constant timestamptz := '2026-10-31 14:00+05';
  oct_mid constant timestamptz := '2026-10-15 00:00+05';
  jul constant date := '2026-07-01';
  aug constant date := '2026-08-01';
  sep constant date := '2026-09-01';
  oct constant date := '2026-10-01';
  n int;
begin
  if exists (select 1 from finance_month_fix where fix = fix_key) then
    raise notice 'finance work month fix already applied';
    return;
  end if;
  if exists (select 1 from pay_runs where period between jul and oct and status in ('approved', 'paid')) then
    raise exception 'A Jul–Oct 2026 pay run is approved — fix by hand';
  end if;

  -- Backups.
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'finance_entries', fe.id, to_jsonb(fe) from finance_entries fe
  where fe.period between aug and oct or (fe.source = 'carry' and fe.carry_from = oct);
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'salary_months', s.id, to_jsonb(s) from salary_months s where s.period between jul and oct;
  insert into finance_month_fix (fix, tbl, row_id, row_data)
  select fix_key, 'acct_entries', a.id, to_jsonb(a) from acct_entries a
  where a.source like 'pay:%' or a.source like 'payroll:2026-10:%';

  -- Rows that become salary payments (remember them for the journal).
  create temp table fix_converted on commit drop as
  select id from finance_entries
  where kind = 'adjustment' and source = 'manual' and created_at < cutoff and (
       (period = aug and (title ilike '%july%' or title ilike '%avgust%'))
    or (period = sep and created_at < '2026-09-10 00:00+05')
    or (period = oct and created_at < oct_mid));

  -- 1. November carry rows from October: wrong month.
  delete from finance_entries where source = 'carry' and carry_from = oct;
  get diagnostics n = row_count; raise notice 'carry rows dropped: %', n;

  -- 2. October → September.
  update finance_entries set period = sep, kind = 'salary'
  where id in (select id from fix_converted) and period = oct;
  update finance_entries set period = sep, title = replace(title, 'Oktabr 2026', 'Sentabr 2026')
  where period = oct and created_at < cutoff
    and (kind = 'salary' or (kind = 'advance' and created_at < oct_mid));
  get diagnostics n = row_count; raise notice 'October payments moved to September: %', n;

  update salary_months s set gross_amount = o.gross_amount, set_by = o.set_by, set_at = o.set_at
  from salary_months o
  where s.period = sep and o.period = oct and o.staff_id = s.staff_id;
  delete from salary_months o
  where o.period = oct and exists (select 1 from salary_months s where s.period = sep and s.staff_id = o.staff_id);
  update salary_months set period = sep where period = oct;

  -- 3. Older salaries typed as bonuses → salary payments of their work month.
  update finance_entries set period = jul, kind = 'salary'
  where id in (select id from fix_converted) and period = aug and title ilike '%july%';
  update finance_entries set period = aug, kind = 'salary'
  where id in (select id from fix_converted) and period in (aug, sep) and created_at < '2026-10-01 00:00+05';

  insert into salary_months (staff_id, period, gross_amount, set_at)
  select fe.staff_id, fe.period, sum(fe.amount), now()
  from finance_entries fe
  where fe.id in (select id from fix_converted) and fe.period in (jul, aug)
  group by fe.staff_id, fe.period
  on conflict (staff_id, period) do update set gross_amount = salary_months.gross_amount + excluded.gross_amount;

  -- 4. Journal: payment keys follow their period; converted rows get cash
  -- postings (6710 → bank, as lib/pay-cash.ts); October's accrual goes.
  update acct_entries a set source = 'pay:' || fe.period::text || ':' || fe.id::text
  from finance_entries fe
  where a.source like 'pay:%' and a.source = 'pay:' || substr(a.source, 5, 10) || ':' || fe.id::text
    and a.source <> 'pay:' || fe.period::text || ':' || fe.id::text
    and not acct_month_closed(a.entry_date);

  insert into acct_entries (entry_date, doc, description, debit, credit, amount, source)
  select (fe.created_at at time zone 'Asia/Tashkent')::date, 'AUTO',
    left('Oylik — ' || coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Xodim'), 300),
    '6710', coalesce(fe.method, '5110'), fe.amount, 'pay:' || fe.period::text || ':' || fe.id::text
  from finance_entries fe join profiles p on p.id = fe.staff_id
  where fe.id in (select id from fix_converted) and fe.amount > 0
    and not acct_month_closed((fe.created_at at time zone 'Asia/Tashkent')::date)
    and not exists (select 1 from acct_entries a where a.source = 'pay:' || fe.period::text || ':' || fe.id::text);

  delete from acct_entries where source like 'payroll:2026-10:%' and not acct_month_closed(entry_date);

  insert into pay_run_log (period, action, detail)
  values (sep, 'work_month_fix', jsonb_build_object('from', oct,
    'note', 'Sentabr ishi uchun Oktabrda to‘langanlar Sentabrga, bonus deb yozilgan oyliklar oylik to‘loviga o‘tkazildi (zaxira: finance_month_fix)'));
end $$;

commit;

-- Operatsiya HQ o'quvchi to'lovlari = tushum (owner, 2026-11-16: "Operation
-- HQ dagi o'quvchi to'lov qilgani bizga tushum bo'lib kelishi kerak").
--
-- Every crm_payments row is mirrored into the journal as one posting,
-- source 'crm:<id>', dated paid_at:
--   payment  Dt kassa (5010, method 'cash') or bank (5110, anything else)
--            Kt 9030 Ta'lim xizmatlaridan daromad
--   refund / cancellation (is_refund)  the same accounts the other way.
-- A trigger keeps it in step on insert / update / delete. If the month is
-- closed in Buxgalteriya the posting is skipped with a warning and the
-- payment itself still saves (reopen the month and run
-- select crm_payments_journal_sync() to catch up).
-- The journal had no student income before this (checked 2026-11-16: only
-- AUTO payroll rows), so the backfill cannot double count.

begin;

create or replace function crm_payment_posting(p crm_payments) returns void
language plpgsql as $$
declare
  box  text := case when p.method = 'cash' then '5010' else '5110' end;
  who  text;
begin
  delete from acct_entries where source = 'crm:' || p.id;
  if coalesce(p.amount, 0) <= 0 then
    return;
  end if;
  select nullif(trim(full_name), '') into who from crm_students where id = p.student_id;
  insert into acct_entries (entry_date, doc, description, debit, credit, amount, source)
  values (
    p.paid_at,
    'OPS',
    left(case when p.is_refund then 'O''quvchiga qaytarildi — ' else 'O''quvchi to''lovi — ' end
         || coalesce(who, 'O''quvchi') || coalesce(' · ' || nullif(p.group_name, ''), ''), 300),
    case when p.is_refund then '9030' else box end,
    case when p.is_refund then box else '9030' end,
    p.amount,
    'crm:' || p.id);
end $$;

create or replace function crm_payments_journal_trg() returns trigger
language plpgsql as $$
begin
  begin
    if tg_op = 'DELETE' then
      delete from acct_entries where source = 'crm:' || old.id;
    else
      perform crm_payment_posting(new);
    end if;
  exception when others then
    -- A closed month (period_closed) must not block the payment itself.
    raise warning 'crm payment % not posted to journal: %', coalesce(new.id, old.id), sqlerrm;
  end;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_crm_payments_journal on crm_payments;
create trigger trg_crm_payments_journal
  after insert or update or delete on crm_payments
  for each row execute function crm_payments_journal_trg();

-- Re-post every payment (also the catch-up after reopening a month).
-- Returns how many payments could not be posted (closed months).
create or replace function crm_payments_journal_sync() returns int
language plpgsql as $$
declare
  r crm_payments;
  failed int := 0;
begin
  for r in select * from crm_payments loop
    begin
      perform crm_payment_posting(r);
    exception when others then
      failed := failed + 1;
    end;
  end loop;
  return failed;
end $$;

do $$
declare n int;
begin
  n := crm_payments_journal_sync();
  raise notice 'crm payments not posted (closed months): %', n;
  raise notice 'crm payments in journal: %', (select count(*) from acct_entries where source like 'crm:%');
end $$;

commit;

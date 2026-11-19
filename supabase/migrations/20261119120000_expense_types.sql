-- Xarajat turlari (owner, 2026-11-19): every expense names its type, the
-- statistics group by that type, and each type has a recurrence the
-- next-month forecast uses.
--
--   acct_entries.cat     the Kirim-chiqim category the row was written under
--                        (null for automatic postings: payroll, Ops payments…)
--   acct_cash_cats.cycle 'auto' = detected from history (src/lib/expense-forecast.ts),
--                        or set by hand: monthly | quarter | year | once
--
-- New expense types come from the 35 SchoolUp expense types, merged.
-- 'refund' books against 9030, so a refund given in cash lowers income
-- (as Operatsiya HQ refunds do) instead of counting as an expense.
-- 'levy' is a fee or tax paid straight away (9810); 'tax' stays the
-- payment of an accrued tax (6410).

begin;

alter table acct_cash_cats
  add column if not exists cycle text not null default 'auto'
    check (cycle in ('auto', 'monthly', 'quarter', 'year', 'once'));

alter table acct_entries
  add column if not exists cat text references acct_cash_cats(k) on update cascade on delete set null;

create index if not exists acct_entries_cat_idx on acct_entries (cat) where cat is not null;

insert into acct_cash_cats (k, n, dir, acc, sort) values
  ('water',   'Ichimlik suvi',                       'out', '9430', 0),
  ('net',     'Internet va telefon',                 'out', '9430', 0),
  ('soft',    'Server va dasturlar',                 'out', '9430', 0),
  ('house',   'Xo‘jalik va tozalik',                 'out', '9430', 0),
  ('office',  'Kanstovar va ofis',                   'out', '9420', 0),
  ('repair',  'Ta’mirlash',                          'out', '9430', 0),
  ('reward',  'O‘quvchilar mukofoti',                'out', '9410', 0),
  ('team',    'Jamoa va HR',                         'out', '9420', 0),
  ('train',   'Trening va rivojlanish',              'out', '9420', 0),
  ('levy',    'Yig‘imlar va soliqlar (to‘g‘ridan)',  'out', '9810', 0),
  ('bank',    'Bank komissiyasi',                    'out', '9430', 0),
  ('charity', 'Ehson',                               'out', '9430', 0),
  ('refund',  'O‘quvchiga qaytarilgan pul',          'out', '9030', 0)
on conflict (k) do nothing;

-- Internet has its own type now.
update acct_cash_cats set n = 'Kommunal (svet, gaz)' where k = 'util' and n = 'Kommunal (svet, gaz, internet)';

-- One order for the expense list on every form.
update acct_cash_cats c set sort = v.sort
from (values
  ('rent', 110), ('util', 120), ('water', 130), ('net', 140), ('soft', 150),
  ('mkt', 160), ('reward', 170), ('books', 180), ('house', 190), ('office', 200),
  ('repair', 210), ('team', 220), ('train', 230), ('levy', 240), ('bank', 250),
  ('charity', 260), ('equip', 270), ('supplier', 280), ('tax', 290), ('social', 300),
  ('tsalary', 310), ('asalary', 320), ('refund', 330), ('other', 900)
) as v(k, sort)
where c.k = v.k and c.dir = 'out';

update acct_cash_cats set cycle = 'monthly' where k in ('rent', 'tsalary', 'asalary') and cycle = 'auto';

-- Hand-typed cash rows written before this: their category, read the way
-- the cash book did (same account, name prefix first). Closed months stay
-- untouched — their journal is frozen.
update acct_entries e set cat = (
    select c.k from acct_cash_cats c
    where c.dir = case when e.debit ~ '^5[01][0-9]{2}$' then 'in' else 'out' end
      and c.acc = case when e.debit ~ '^5[01][0-9]{2}$' then e.credit else e.debit end
    order by (e.description like c.n || '%') desc, c.sort
    limit 1)
where e.source is null
  and e.cat is null
  and (e.debit ~ '^5[01][0-9]{2}$') <> (e.credit ~ '^5[01][0-9]{2}$')
  and not exists (
    select 1 from acct_periods p
    where p.closed_at is not null and p.month = date_trunc('month', e.entry_date)::date);

commit;

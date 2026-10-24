-- ==========================================================================
-- Finance v2, phases 2–4 (owner, 2026-10-21).
--
--   * Cash boxes: any asset account flagged `cash_box` is a kassa / bank /
--     karta the cash book (Kirim-chiqim) and the payroll can pay from. 5010
--     (naqd) and 5110 (bank) are the two that exist today; more are added
--     from the UI.
--   * Editable Kirim-chiqim categories (were hard-coded in CASH_CATS).
--   * finance_entries.method: the cash box a salary / advance payment left
--     from. Every payment is posted to the journal (6710 → box) on its own,
--     so Kirim-chiqim shows payroll without a manual step.
--   * pay_receipts: the staff member's "Oldim" (received) / "Muammo bor"
--     answer to a payment.
--   * reimbursements: a staff member asks for money they spent for the
--     centre back; approving it adds a 'reimburse' row to a payroll month.
--
-- Self-contained, additive, safe to re-run.
-- ==========================================================================

begin;

alter table acct_accounts add column if not exists cash_box boolean not null default false;
update acct_accounts set cash_box = true where code in ('5010', '5110') and not cash_box;

create table if not exists acct_cash_cats (
  k       text primary key check (k ~ '^[a-z0-9_]{1,24}$'),
  n       text not null check (char_length(n) between 1 and 80),
  dir     text not null check (dir in ('in', 'out')),
  acc     text not null references acct_accounts(code),
  sort    int not null default 0,
  active  boolean not null default true
);

insert into acct_cash_cats (k, n, dir, acc, sort) values
  ('tuition', 'O‘quvchi to‘lovi (o‘qish haqi)', 'in', '9030', 10),
  ('prepay', 'Oldindan to‘lov (keyingi oylar uchun)', 'in', '6310', 20),
  ('debt', 'O‘quvchi qarzini to‘ladi', 'in', '4010', 30),
  ('material', 'Darslik / material sotuvi', 'in', '9030', 40),
  ('capital', 'Ta’sischi mablag‘i', 'in', '8300', 50),
  ('tsalary', 'O‘qituvchilar maoshi', 'out', '9130', 60),
  ('asalary', 'Ma’muriyat maoshi', 'out', '9420', 70),
  ('rent', 'Ijara', 'out', '9420', 80),
  ('util', 'Kommunal (svet, gaz, internet)', 'out', '9430', 90),
  ('mkt', 'Marketing / reklama', 'out', '9410', 100),
  ('books', 'Darslik va o‘quv materiallari', 'out', '9130', 110),
  ('tax', 'Soliq to‘lovi', 'out', '6410', 120),
  ('social', 'Ijtimoiy soliq to‘lovi', 'out', '6520', 130),
  ('equip', 'Jihoz / mebel xaridi', 'out', '0100', 140),
  ('supplier', 'Yetkazib beruvchiga to‘lov', 'out', '6010', 150),
  ('other', 'Boshqa xarajat', 'out', '9430', 160)
on conflict (k) do nothing;

alter table finance_entries add column if not exists method text references acct_accounts(code);

alter table finance_entries drop constraint if exists finance_entries_source_check;
alter table finance_entries
  add constraint finance_entries_source_check
  check (source in ('manual', 'kpi', 'payrun', 'advance', 'correction', 'carry', 'reimburse'));

create table if not exists pay_receipts (
  entry_id  uuid primary key references finance_entries(id) on delete cascade,
  staff_id  uuid not null references profiles(id) on delete cascade,
  status    text not null check (status in ('received', 'disputed')),
  note      text not null default '' check (char_length(note) <= 500),
  at        timestamptz not null default now()
);
create index if not exists pay_receipts_staff_idx on pay_receipts (staff_id);

create table if not exists reimbursements (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references profiles(id) on delete cascade,
  amount         numeric(14, 2) not null check (amount > 0),
  title          text not null check (char_length(title) between 1 and 120),
  note           text not null default '' check (char_length(note) <= 1000),
  spent_on       date,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  period         date,
  entry_id       uuid references finance_entries(id) on delete set null,
  decided_by     uuid references profiles(id) on delete set null,
  decided_at     timestamptz,
  decision_note  text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists reimbursements_staff_idx on reimbursements (staff_id, created_at desc);
create index if not exists reimbursements_pending_idx on reimbursements (status) where status = 'pending';

commit;

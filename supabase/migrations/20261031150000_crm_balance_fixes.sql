-- Operation HQ › O'quvchilar: «Balansni tuzatish» (owner, 2026-10-31).
-- Removes a wrong minus from a student's balance (an import error, a charge
-- taken twice). It is not a payment: it never counts as collected money,
-- a payment, a charge or a reason to be faol — only the balance moves.
--
-- Also lets the log take 'payedit' / 'paycancel': the payment edit and
-- cancel from 2026-10-28 write those kinds and the old check refused them,
-- which rolled back every edit and cancel.

begin;

create table if not exists crm_balance_fixes (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references crm_students(id) on delete cascade,
  amount     numeric(14,2) not null check (amount > 0),
  reason     text not null check (length(trim(reason)) > 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_balance_fixes_student_idx on crm_balance_fixes (student_id);

alter table crm_student_log drop constraint if exists crm_student_log_kind_check;
alter table crm_student_log add constraint crm_student_log_kind_check
  check (kind in ('pay', 'charge', 'edit', 'msg', 'archive', 'restore', 'freeze', 'call', 'settings', 'payedit', 'paycancel', 'fix'));

commit;

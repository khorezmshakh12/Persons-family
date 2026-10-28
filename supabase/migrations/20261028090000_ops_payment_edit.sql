-- Operation HQ › O'quvchilar (2026-10-28): a recorded student payment can be
-- corrected later (cash → Click, amount, date) and cancelled without deleting it.
--   edited_*  — the last correction, shown as a badge; every correction also
--               leaves a crm_student_log row with old → new.
--   reverses  — a cancel is a refund row pointing at the payment it cancels,
--               so every report that already nets refunds stays right and the
--               original row is kept. One cancel per payment.

begin;

alter table crm_payments add column if not exists edited_at timestamptz;
alter table crm_payments add column if not exists edited_by uuid references profiles(id) on delete set null;
alter table crm_payments add column if not exists edit_note text;
alter table crm_payments add column if not exists reverses uuid references crm_payments(id) on delete set null;

create unique index if not exists crm_payments_reverses_uq on crm_payments (reverses) where reverses is not null;

commit;

-- CRM o'quvchi balansi (2026-10-15).
--
-- Import paytida schoolup'dagi joriy balans (manfiy = qarz) shu ustunga
-- yoziladi, toki UI qarzdorlarni ko'rsata olsin. Bosqich 3'da balans to'lov/
-- charge amallaridan jonli hisoblanadi (crm_charges − crm_payments); bu ustun
-- o'sha paytda boshlang'ich (opening) qoldiq bo'lib qoladi.
begin;

alter table crm_students
  add column if not exists balance numeric(14,2) not null default 0;

commit;

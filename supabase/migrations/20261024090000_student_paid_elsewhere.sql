-- Qo'lda faol (owner, 2026-10-24): boshqa CRM'da to'lagan o'quvchi bu yerda
-- to'lov yozmasdan faol qilinadi. Belgi bor bo'lsa «kamida bitta to'lov»
-- sharti bajarilgan hisoblanadi; to'lov va kassa o'zgarmaydi.
begin;

alter table crm_students
  add column if not exists paid_elsewhere_at timestamptz,
  add column if not exists paid_elsewhere_source text,
  add column if not exists paid_elsewhere_by uuid references profiles(id) on delete set null;

commit;

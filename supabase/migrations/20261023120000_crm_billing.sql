-- Operation HQ › O'quvchilar (2026-10-23): CRM o'quvchilari bo'yicha oylik
-- avto-yechim, ota-onaga xabarlar, to'lov bahosi, arxiv va amallar tarixi.
--
--   * O'quvchi darajasida hisob (guruhsiz): crm_students.monthly_fee /
--     billing_start — null bo'lsa faol abonementlardan olinadi (tarif yig'indisi,
--     eng erta aktiv sana). Chegirma (%), bo'lib to'lash (1 yoki 2 qism),
--     muzlatish muddati (frozen_until).
--   * crm_charges endi o'quvchiga ham bog'lanadi (student_id) va davr kaliti
--     (period_key) bilan — /api/cron/crm-billing bir davrni ikki marta yozmaydi.
--     Eski (enroll/import) charge'lar period_key'siz qoladi.
--   * crm_message_templates — ota-onaga xabar shablonlari (qo'shish/tahrir/o'chirish).
--   * crm_student_messages — yuborilgan har bir xabar; avto eslatmalar
--     (before/due) bir davrga bir marta (unique).
--   * crm_student_log — kim, qachon, nima qildi (to'lov, yechim, tahrir, arxiv).
--   * crm_debt_calls — qarzdorga qo'ng'iroq natijalari.
--   * crm_billing_settings — bitta qator: yoqilgan, qaysi sanadan, necha kun
--     oldin eslatish, to'lov havolasi, necha kundan keyin qo'ng'iroq ro'yxati.
begin;

create table if not exists crm_billing_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  start_date date not null default '2026-11-01',
  remind_days int not null default 3 check (remind_days between 0 and 10),
  pay_link text not null default '',
  call_after_days int not null default 7 check (call_after_days between 1 and 60),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into crm_billing_settings (id) values (true) on conflict do nothing;

alter table crm_students
  add column if not exists monthly_fee numeric(14,2) check (monthly_fee is null or monthly_fee >= 0),
  add column if not exists billing_start date,
  add column if not exists discount_pct int not null default 0 check (discount_pct between 0 and 100),
  add column if not exists discount_reason text,
  add column if not exists installments int not null default 1 check (installments in (1, 2)),
  add column if not exists frozen_until date,
  add column if not exists leave_note text,
  add column if not exists archived_by uuid references profiles(id) on delete set null;

alter table crm_charges alter column enrollment_id drop not null;
alter table crm_charges
  add column if not exists student_id uuid references crm_students(id) on delete cascade,
  add column if not exists period_key text,
  add column if not exists source text not null default 'enroll' check (source in ('enroll', 'auto', 'manual', 'import')),
  add column if not exists note text,
  add column if not exists created_by uuid references profiles(id) on delete set null;
create unique index if not exists crm_charges_student_period_uq on crm_charges (student_id, period_key) where period_key is not null;
create index if not exists crm_charges_student_idx on crm_charges (student_id);

create table if not exists crm_message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  trigger text not null default 'none' check (trigger in ('before', 'due', 'paid', 'none')),
  sort int not null default 0,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into crm_message_templates (name, body, trigger, sort)
select * from (values
  ('3 kun oldin eslatma', E'Assalomu alaykum, {ota_ona}! {ism} uchun oylik to‘lov — {summa}, to‘lov kuni {sana}.\nIltimos, o‘z vaqtida to‘lang. Rahmat! — Persons', 'before', 1),
  ('To‘lov kuni', E'Assalomu alaykum! Bugun {ism} uchun to‘lov kuni: {summa}.\nJami to‘lanishi kerak: {qarz}. — Persons', 'due', 2),
  ('Qarz bo‘yicha', E'Assalomu alaykum, {ota_ona}! {ism} bo‘yicha {qarz} qarzdorlik bor. Iltimos, yaqin kunlarda to‘lang yoki biz bilan bog‘laning. — Persons', 'none', 3),
  ('To‘lov qabul qilindi', E'{ism} uchun {tolandi} qabul qilindi. Rahmat! Qoldiq: {qarz}. Keyingi to‘lov kuni: {sana}. — Persons', 'paid', 4)
) as v(name, body, trigger, sort)
where not exists (select 1 from crm_message_templates);

create table if not exists crm_student_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references crm_students(id) on delete cascade,
  template_id uuid references crm_message_templates(id) on delete set null,
  title text not null default '',
  trigger text not null default 'none',
  due_date date,
  body text not null,
  recipients int not null default 0,
  sent int not null default 0,
  actor uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_student_messages_auto_uq on crm_student_messages (student_id, trigger, due_date)
  where trigger in ('before', 'due');
create index if not exists crm_student_messages_student_idx on crm_student_messages (student_id, created_at desc);

create table if not exists crm_student_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references crm_students(id) on delete cascade,
  kind text not null check (kind in ('pay', 'charge', 'edit', 'msg', 'archive', 'restore', 'freeze', 'call', 'settings')),
  text text not null,
  amount numeric(14,2),
  actor uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_student_log_at_idx on crm_student_log (created_at desc);
create index if not exists crm_student_log_student_idx on crm_student_log (student_id, created_at desc);

create table if not exists crm_debt_calls (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references crm_students(id) on delete cascade,
  result text not null check (result in ('promised', 'no_answer', 'refused', 'other')),
  promised_date date,
  note text not null default '',
  actor uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_debt_calls_student_idx on crm_debt_calls (student_id, created_at desc);

commit;

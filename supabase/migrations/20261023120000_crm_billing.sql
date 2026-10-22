-- Oylik avto-yechim (2026-10-23): Operation HQ › O'quvchilar.
--
-- /api/cron/crm-billing har kuni: aktiv abonementning to'lov kuni kelganda
-- crm_charges'ga shu davr uchun charge yozadi va o'quvchi balansini kamaytiradi
-- (enroll bilan bir xil model), to'lovdan N kun oldin va to'lov kuni ota-onaga
-- CRM bot orqali eslatma yuboradi.
--   * crm_billing_settings — bitta qator: yoqilgan, qaysi sanadan boshlab,
--     necha kun oldin eslatish. start_date — import qilingan eski qarzlar
--     ikki marta yechilmasligi uchun chegara.
--   * crm_billing_notices — bir davr uchun bir eslatma (qayta yuborilmasin).
begin;

create table if not exists crm_billing_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  start_date date not null default '2026-11-01',
  remind_days int not null default 3 check (remind_days between 0 and 10),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into crm_billing_settings (id) values (true) on conflict do nothing;

create table if not exists crm_billing_notices (
  enrollment_id uuid not null references crm_enrollments(id) on delete cascade,
  due_date date not null,
  kind text not null check (kind in ('before', 'due')),
  sent int not null default 0,
  created_at timestamptz not null default now(),
  primary key (enrollment_id, due_date, kind)
);

create index if not exists crm_charges_enr_period_idx on crm_charges (enrollment_id, period_start);

commit;

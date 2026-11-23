-- Operation HQ › O'quvchilar v3 (owner, 2026-11-23).
-- 1. crm_student_log.kind: 'chargecancel' (20261120 yechimni bekor qilish)
--    ro'yxatga qo'shilmagan edi — bekor qilish, muzlatish/arxivdagi
--    «yechimni ham bekor qilish» saqlanmay qolardi. + 'shift' (to'lov sanasini surish).
-- 2. crm_charges.cancelled_amount: qisman bekor qilish. amount = qolgan qism,
--    cancelled_amount = balansga qaytgan qism (jami qaytgani).
-- 3. crm_daily_stats: qarzdorlar / faol / muzlatilgan — har kunlik surat
--    (tarixi bazada yo'q, shu kundan boshlab yig'iladi).
-- 4. crm_students.restart_on_activate: «minus qolsin, qo'lda faollashtirilguncha»
--    muzlatish — faollashtirilgan kun yangi to'lov kuni (billing_start) bo'ladi.
begin;

alter table crm_students add column if not exists restart_on_activate boolean not null default false;

alter table crm_student_log drop constraint if exists crm_student_log_kind_check;
alter table crm_student_log add constraint crm_student_log_kind_check
  check (kind in ('pay', 'charge', 'chargecancel', 'shift', 'edit', 'msg', 'archive', 'restore', 'freeze', 'call',
    'settings', 'payedit', 'paycancel', 'fix'));

alter table crm_charges add column if not exists cancelled_amount numeric(14,2) not null default 0;

create table if not exists crm_daily_stats (
  day date primary key,
  active int not null,
  frozen int not null,
  debtors int not null,
  debt bigint not null,
  created_at timestamptz not null default now()
);

commit;

-- Operation HQ › O'quvchilar (owner, 2026-11-20): yechimni bekor qilish.
-- Hech narsa o'chmaydi: yechim status = 'waived' bo'ladi, kim / qachon /
-- nima sababdan bekor qilgani shu yerda qoladi, summa balansga qaytadi.
-- period_key joyida qoladi — avto-yechim o'sha davrni qayta yechmaydi.
begin;

alter table crm_charges
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references profiles(id) on delete set null,
  add column if not exists cancel_reason text;

commit;

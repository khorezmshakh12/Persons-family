-- O'quvchi izohidan eslatma (owner, 2026-10-22): izohga sana qo'yilsa, o'sha
-- kuni muallifning dashboard'ida chiqadi; «O'qidim» bosilsa yo'qoladi.
begin;

alter table crm_student_notes
  add column if not exists remind_at date,
  add column if not exists remind_done_at timestamptz;
create index if not exists crm_student_notes_remind_idx on crm_student_notes (created_by, remind_at)
  where remind_at is not null and remind_done_at is null;

commit;

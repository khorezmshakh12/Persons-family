-- Lesson Plans: guruh darajasi (Beginner … Advanced, IELTS Foundation, IELTS,
-- CEFR, iTEP). Ro'yxat lib/course-levels.ts'da; imtihon kunlari shu daraja
-- bo'yicha Materials saytidagi imtihonga bog'lanadi (2026-10-24).
begin;

alter table groups add column if not exists level text;

commit;

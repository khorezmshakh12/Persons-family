-- Lesson Plans: 36 darslik kurs rejasi + test turlari (2026-10-18).
-- Mavjud sana-asosli slotlar ustiga qo'shimcha: syllabus_position (1..N tartib)
-- va lesson_type (dars / progress_test / month_test / final_test).
begin;

alter table course_lessons add column if not exists lesson_type text not null default 'lesson';
alter table course_lessons add column if not exists syllabus_position int;

commit;

-- course_lessons: replace the free-text "description" (offline game notes)
-- concept with a full lesson-plan accordion (aim / language focus /
-- anticipated problems / materials / homework / procedure), matching the
-- redesigned Course Lessons table. The old `description` column is left in
-- place (unused by the new UI) rather than dropped, so no existing teacher
-- input is lost.
alter table course_lessons
  add column aim text,
  add column language_focus text,
  add column anticipated_problems text,
  add column materials text,
  add column homework text,
  add column procedure jsonb not null default '[]'::jsonb;

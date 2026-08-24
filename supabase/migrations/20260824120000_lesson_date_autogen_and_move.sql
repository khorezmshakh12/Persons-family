-- Two existing (group_id, lesson_date) duplicate pairs predate the
-- app-level dedup check added in updateLessonDateAction — for each pair,
-- null out lesson_date on whichever row is NOT a complete plan (same
-- topic/aim/language_focus/anticipated_problems/homework rule the
-- lesson-plan-check cron already uses), so the real plan survives and the
-- stray duplicate goes back to unscheduled. Without this, the unique index
-- below would fail to create.
with duplicates as (
  select group_id, lesson_date, array_agg(id order by
    (topic is not null and trim(topic) != '' and
     aim is not null and trim(aim) != '' and
     language_focus is not null and trim(language_focus) != '' and
     anticipated_problems is not null and trim(anticipated_problems) != '' and
     homework is not null and trim(homework) != '') desc
  ) as ids
  from course_lessons
  where lesson_date is not null
  group by group_id, lesson_date
  having count(*) > 1
)
update course_lessons set lesson_date = null
where id in (select ids[2] from duplicates);

-- Closes the duplicate-date bug class at the schema level — the app-level
-- check in updateLessonDateAction stays too, for a clean error message
-- instead of a raw constraint violation, but this is what actually
-- guarantees a group can never have two rows on the same date again (a
-- stray duplicate is what let a teacher's completed plan get shadowed and
-- misreported as "missing" to the CEO — see the cron's dedup comment).
create unique index course_lessons_group_lesson_date_key
  on course_lessons (group_id, lesson_date)
  where lesson_date is not null;

-- Reschedule ("move") feature: a teacher who wrote a plan for a day class
-- didn't actually happen on can move that plan's content to a different
-- date instead of leaving a stale duplicate. moved_to/moved_from point at
-- each other; moved_at/move_reason live on the destination row, which is
-- where the audit trail reads as "this is where it came from and why."
alter table course_lessons
  add column moved_to_lesson_id uuid references course_lessons(id) on delete set null,
  add column moved_from_lesson_id uuid references course_lessons(id) on delete set null,
  add column moved_at timestamptz,
  add column move_reason text;

-- Lesson Plans: kurs rejasi endi Course lessons'dagi to'ldirilgan darslar
-- bo'yicha sanaladi (lib/syllabus.ts › syncCourseSchedule). Hisob guruhning
-- syllabus_from sanasidan boshlanadi: mavjud guruhlar uchun — bugun, yangi
-- guruhlar uchun — ochilgan kuni (2026-10-25).
begin;

alter table groups add column if not exists syllabus_from date;
update groups set syllabus_from = (now() at time zone 'Asia/Tashkent')::date where syllabus_from is null;

-- Oldingi versiya (sana pozitsiyasi bo'yicha) avtomatik yozgan imtihon
-- matnlarini olib tashlaymiz — faqat ustoz o'zgartirmagan maydonlar.
update course_lessons set
  topic = null,
  aim = case when aim like 'Progress Test _ (Part %' or aim like 'Middle Exam%oraliq imtihon' or aim like 'Level Up Exam%yakuniy imtihon%' then null else aim end,
  materials = case when materials like 'Materials › %' then null else materials end,
  homework = case when homework in ('Xatolar ustida ishlash (Materials natijalar sahifasi)', '—') then null else homework end,
  procedure = '[]'
where lesson_type in ('progress_test', 'midterm', 'final_test')
  and topic in ('Progress Test 1', 'Progress Test 2', 'Progress Test 3', 'Progress Test 4', 'Middle Exam', 'Level Up Exam')
  and (aim like 'Progress Test _ (Part %' or aim like 'Middle Exam%' or aim like 'Level Up Exam%');

update course_lessons set syllabus_position = null, lesson_type = 'lesson'
where syllabus_position is not null or lesson_type <> 'lesson';

commit;

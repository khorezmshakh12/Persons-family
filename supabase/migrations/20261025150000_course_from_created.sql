-- Lesson Plans: kurs guruh ochilgan kundan jadval bo'yicha sanaladi
-- (lib/syllabus.ts). Mavjud guruhlar uchun kurs boshi = ochilgan kun
-- (Toshkent vaqti), 36 dan keyin keyingi kurs davom etadi (2026-10-25).
begin;

update groups set syllabus_from = (created_at at time zone 'Asia/Tashkent')::date
where created_at is not null;

commit;

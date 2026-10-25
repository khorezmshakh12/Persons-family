import 'server-only';
import { sql } from '@/lib/db/client';
import { ensureCourseSlots } from '@/lib/lesson-generation';
import { escapeTelegramText, notifyUsers } from '@/lib/telegram';
import { tashkentDayKey } from '@/lib/time';
import {
  EXAM_LABEL,
  coursePosLabel,
  examPlanFor,
  examsToAnnounce,
  lessonTypeForPosition,
  planPositions,
} from '@/lib/syllabus-template';

/**
 * Guruhning Course lessons jadvalini 36 darslik kurs rejasiga moslaydi
 * (idempotent; guruh sahifasi ochilganda chaqiriladi):
 *   1. Joriy kurs (3 oy) uchun slotlar yaratiladi — ensureCourseSlots.
 *   2. Kurs `syllabus_from` (guruh ochilgan kun) dan har bir dars kuni sana
 *      tartibida raqam oladi; 7, 14, 25, 32 — Progress Test, 18 — Middle
 *      Exam, 36 — Level Up Exam. Dars ko'chirilsa keyingi imtihonlar suriladi.
 *   3. Bugundan keyingi imtihon kunlarining bo'sh maydonlari Materials'dan
 *      to'ldiriladi; imtihon boshqa kunga surilsa eski kundagi avtomatik matn
 *      (ustoz o'zgartirmagan bo'lsa) olib tashlanadi. O'tgan darslarga tegilmaydi.
 *   4. Imtihondan oldingi dars lesson plani yozilganda ustoz + yordamchiga
 *      bir marta xabar boradi: «7-darsda Progress Test olishingiz kerak».
 * Xatolik sahifani buzmaydi.
 */
export async function syncCourseSchedule(groupId: string): Promise<void> {
  try {
    const today = tashkentDayKey();
    await ensureCourseSlots(groupId, today);

    const [group] = await sql<
      { name: string; level: string | null; teacher_id: string; assigned_ta_id: string | null; syllabus_from: string | null }[]
    >`
      select name, level, teacher_id, assigned_ta_id, syllabus_from::text as syllabus_from from groups where id = ${groupId}
    `;
    if (!group?.syllabus_from) return;

    const rows = await sql<{ id: string; date: string; filled: boolean; pos: number | null; type: string }[]>`
      select id, lesson_date::text as date, coalesce(trim(topic), '') <> '' as filled,
        syllabus_position as pos, lesson_type as type
      from course_lessons
      where group_id = ${groupId}
        and lesson_date >= ${group.syllabus_from}::date
        and moved_to_lesson_id is null
      order by lesson_date asc, lesson_number asc
    `;
    const plan = planPositions(rows);
    const ids = plan.map((a) => a.id);

    // Ro'yxatdan chiqqan darslar (ko'chirib yuborilgan) raqamsiz qoladi.
    await sql`
      update course_lessons set syllabus_position = null, lesson_type = 'lesson'
      where group_id = ${groupId} and syllabus_position is not null
        and not (id = any(${sql.array(ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])}::uuid[]))
    `;

    for (let i = 0; i < plan.length; i++) {
      const a = plan[i];
      const old = rows[i];
      if (old.pos === a.pos && old.type === a.type) {
        if (a.type !== 'lesson' && a.date >= today) await fillExam(a.id, a.pos, group.level);
        continue;
      }
      await sql`update course_lessons set syllabus_position = ${a.pos}, lesson_type = ${a.type} where id = ${a.id}`;
      if (a.date < today) continue;
      if (old.pos !== null && lessonTypeForPosition(old.pos) !== 'lesson') await clearExam(a.id, old.pos, group.level);
      if (a.type !== 'lesson') await fillExam(a.id, a.pos, group.level);
    }

    for (const a of examsToAnnounce(plan, today)) {
      const ref = `course-exam:${groupId}:${a.id}:${a.pos}`;
      const [seen] = await sql`select 1 from notifications where ref = ${ref} limit 1`;
      if (seen) continue;
      const label = EXAM_LABEL[a.type as keyof typeof EXAM_LABEL];
      const prev = coursePosLabel(a.pos - 1);
      await notifyUsers(
        'lesson',
        [group.teacher_id, group.assigned_ta_id],
        `📘 <b>${escapeTelegramText(group.name)}: ${coursePosLabel(a.pos)} — ${examPlanFor(a.pos, group.level)!.topic}</b>\n` +
          `${prev} lesson plani yozildi. Keyingi darsda (${a.date}) ${label} olishingiz kerak. ` +
          `Lesson plani Materials’dagi imtihon bilan avtomatik to‘ldirilgan.`,
        { href: `/lesson-plans/${groupId}`, ref },
      );
    }
  } catch (e) {
    console.error('[syllabus] sync failed', e);
  }
}

/** Imtihon kunining bo'sh maydonlarini to'ldiradi; ustoz yozganiga tegmaydi. */
async function fillExam(lessonId: string, pos: number, level: string | null) {
  const plan = examPlanFor(pos, level);
  if (!plan) return;
  await sql`
    update course_lessons set
      topic = coalesce(nullif(trim(topic), ''), ${plan.topic}),
      aim = coalesce(nullif(trim(aim), ''), ${plan.aim}),
      materials = coalesce(nullif(trim(materials), ''), ${plan.materials}),
      homework = coalesce(nullif(trim(homework), ''), ${plan.homework}),
      procedure = case when coalesce(procedure::jsonb, '[]'::jsonb) = '[]'::jsonb
        then ${sql.json(plan.procedure)} else procedure end
    where id = ${lessonId}
      and (nullif(trim(topic), '') is null or nullif(trim(aim), '') is null
        or (${plan.materials}::text is not null and nullif(trim(materials), '') is null)
        or nullif(trim(homework), '') is null
        or coalesce(procedure::jsonb, '[]'::jsonb) = '[]'::jsonb)
  `;
}

/** Imtihon shu kundan surilganda: hali avtomatik matnligicha qolgan
 * maydonlarni bo'shatadi (ustoz o'zgartirgan maydon qoladi). */
async function clearExam(lessonId: string, oldPos: number, level: string | null) {
  const plan = examPlanFor(oldPos, level);
  if (!plan) return;
  await sql`
    update course_lessons set
      topic = case when topic = ${plan.topic} then null else topic end,
      aim = case when aim = ${plan.aim} then null else aim end,
      materials = case when materials = ${plan.materials} then null else materials end,
      homework = case when homework = ${plan.homework} then null else homework end,
      procedure = case when coalesce(procedure::jsonb, '[]'::jsonb) = ${sql.json(plan.procedure)}::jsonb
        then '[]' else procedure end
    where id = ${lessonId}
  `;
}

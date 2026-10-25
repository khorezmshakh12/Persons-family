import 'server-only';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, notifyUsers } from '@/lib/telegram';
import { EXAM_LABEL, examPlanFor, grammarLessonsBefore, planAssignments } from '@/lib/syllabus-template';

/**
 * Course lessons jadvalidagi darslarni 36 darslik shablon bo'yicha sanaydi
 * (idempotent; guruh sahifasi ochilganda va ustoz mavzu yozganda chaqiriladi):
 *   - hisob guruhning `syllabus_from` sanasidan keyin ustoz lesson plan
 *     (mavzu) yozgan birinchi darsdan boshlanadi;
 *   - har bir to'ldirilgan dars keyingi grammar pozitsiyani oladi;
 *   - imtihon pozitsiyasiga yetganda (7, 14, 18, 25, 32, 36) keyingi dars
 *     imtihon bo'ladi: bo'sh maydonlari Materials'dan to'ldiriladi va
 *     ustoz + yordamchiga xabar boradi («7-darsda Progress Test olishingiz kerak»).
 * Belgilangan pozitsiyalar keyin o'zgarmaydi. Xatolik sahifani buzmaydi.
 */
export async function syncCourseSchedule(groupId: string): Promise<void> {
  try {
    const [group] = await sql<
      { name: string; level: string | null; teacher_id: string; assigned_ta_id: string | null; syllabus_from: string | null }[]
    >`
      select name, level, teacher_id, assigned_ta_id, syllabus_from::text as syllabus_from from groups where id = ${groupId}
    `;
    if (!group) return;

    const rows = await sql<{ id: string; date: string; filled: boolean; pos: number | null }[]>`
      select id, lesson_date::text as date, coalesce(trim(topic), '') <> '' as filled, syllabus_position as pos
      from course_lessons
      where group_id = ${groupId}
        and lesson_date is not null
        and (${group.syllabus_from}::date is null or lesson_date >= ${group.syllabus_from}::date)
        and moved_to_lesson_id is null
      order by lesson_date asc, lesson_number asc
    `;

    for (const a of planAssignments(rows)) {
      // `syllabus_position is null` — ikki parallel chaqiruv bitta darsni ikki
      // marta belgilamasin (va xabar ikki marta ketmasin).
      const res = await sql`
        update course_lessons set syllabus_position = ${a.pos}, lesson_type = ${a.type}
        where id = ${a.id} and syllabus_position is null
      `;
      if (res.count === 0 || a.type === 'lesson') continue;

      const plan = examPlanFor(a.pos, group.level)!;
      await sql`
        update course_lessons set
          topic = coalesce(nullif(trim(topic), ''), ${plan.topic}),
          aim = coalesce(nullif(trim(aim), ''), ${plan.aim}),
          materials = coalesce(nullif(trim(materials), ''), ${plan.materials}),
          homework = coalesce(nullif(trim(homework), ''), ${plan.homework}),
          procedure = case when coalesce(procedure::jsonb, '[]'::jsonb) = '[]'::jsonb
            then ${sql.json(plan.procedure)} else procedure end
        where id = ${a.id}
      `;

      const date = rows.find((r) => r.id === a.id)?.date ?? '';
      await notifyUsers(
        'lesson',
        [group.teacher_id, group.assigned_ta_id],
        `📘 <b>${escapeTelegramText(group.name)}: ${a.pos}-dars — ${plan.topic}</b>\n` +
          `${grammarLessonsBefore(a.pos)} ta dars lesson plani to‘ldirildi. ${a.pos}-darsda (${date}) ${EXAM_LABEL[a.type]} olishingiz kerak. ` +
          `Lesson plani Materials’dagi imtihon bilan avtomatik to‘ldirildi.`,
        { href: `/lesson-plans/${groupId}` },
      );
    }
  } catch (e) {
    console.error('[syllabus] sync failed', e);
  }
}

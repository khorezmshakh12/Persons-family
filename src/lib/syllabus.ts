import 'server-only';
import { sql } from '@/lib/db/client';
import { examPlanFor, lessonTypeForPosition } from '@/lib/syllabus-template';

export { lessonTypeForPosition };

/**
 * Guruh rejasini 36 darslik shablonga moslaydi (sahifa har ochilganda,
 * idempotent):
 *   1. Hali raqamlanmagan darslarni (oylik cron keyin qo'shgan slotlar ham)
 *      sana tartibida mavjud oxirgi pozitsiyadan davom ettirib raqamlaydi.
 *      Allaqachon raqamlanganlari o'zgarmaydi.
 *   2. Har pozitsiyaning turini shablondan qayta qo'yadi (eski shablon:
 *      oylik test va h.k. — yangisiga o'tadi).
 *   3. Imtihon kunlarining (progress / middle / level up) bo'sh maydonlarini
 *      avtomatik to'ldiradi. Ustoz yozgan narsaning ustiga yozmaydi.
 * Xatolik sahifa renderini buzmasligi uchun try/catch ichida.
 */
export async function ensureSyllabusTagged(groupId: string): Promise<void> {
  try {
    const [{ maxPos }] = await sql<{ maxPos: number }[]>`
      select coalesce(max(syllabus_position), 0)::int as "maxPos" from course_lessons where group_id = ${groupId}
    `;
    const untagged = await sql<{ id: string }[]>`
      select id from course_lessons where group_id = ${groupId} and syllabus_position is null
      order by lesson_date asc nulls last, lesson_number asc
    `;
    for (let i = 0; i < untagged.length; i++) {
      await sql`update course_lessons set syllabus_position = ${maxPos + i + 1} where id = ${untagged[i].id}`;
    }

    const rows = await sql<{ id: string; pos: number; type: string }[]>`
      select id, syllabus_position as pos, lesson_type as type from course_lessons
      where group_id = ${groupId} and syllabus_position is not null
    `;
    for (const r of rows) {
      const type = lessonTypeForPosition(r.pos);
      if (type !== r.type) await sql`update course_lessons set lesson_type = ${type} where id = ${r.id}`;
    }

    const [group] = await sql<{ level: string | null }[]>`select level from groups where id = ${groupId}`;
    for (const r of rows) {
      const plan = examPlanFor(r.pos, group?.level ?? null);
      if (!plan) continue;
      await sql`
        update course_lessons set
          topic = coalesce(nullif(trim(topic), ''), ${plan.topic}),
          aim = coalesce(nullif(trim(aim), ''), ${plan.aim}),
          materials = coalesce(nullif(trim(materials), ''), ${plan.materials}),
          homework = coalesce(nullif(trim(homework), ''), ${plan.homework}),
          procedure = case when coalesce(procedure::jsonb, '[]'::jsonb) = '[]'::jsonb
            then ${sql.json(plan.procedure)} else procedure end
        where id = ${r.id}
          and moved_to_lesson_id is null
          and (nullif(trim(topic), '') is null or nullif(trim(aim), '') is null
            or (${plan.materials}::text is not null and nullif(trim(materials), '') is null)
            or nullif(trim(homework), '') is null
            or coalesce(procedure::jsonb, '[]'::jsonb) = '[]'::jsonb)
      `;
    }
  } catch (e) {
    console.error('[syllabus] auto-tag failed', e);
  }
}

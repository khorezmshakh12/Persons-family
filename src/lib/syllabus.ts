import 'server-only';
import { sql } from '@/lib/db/client';

/**
 * Standart 3 oylik (36 dars) kurs shabloni — darsning syllabus pozitsiyasiga
 * qarab turini belgilaydi. Mavjud testlar saqlanadi, ustiga oraliq imtihon
 * qo'shildi (2026-10-20):
 *   - oraliq imtihon (midterm): har 18-darsda (18, 54, ...)
 *   - progress test: 7, 13, 19, 25, 31
 *   - oylik test: 12, 24
 *   - yakuniy test: 36 (kurs oxiri — midterm bilan ustma-ust tushsa ham
 *     yakuniy ustun turadi)
 * Ustozlar keyin bu turni istalgancha o'zgartirishi mumkin.
 */
export function lessonTypeForPosition(pos: number): string {
  if (pos === 36) return 'final_test';
  if (pos % 18 === 0) return 'midterm';
  if ([12, 24].includes(pos)) return 'month_test';
  if ([7, 13, 19, 25, 31].includes(pos)) return 'progress_test';
  return 'lesson';
}

/**
 * Guruh darslarini sana tartibida 1..N raqamlaydi va yuqoridagi shablon
 * bo'yicha test turlarini qo'yadi. Idempotent, lekin BIR MARTALIK: agar birorta
 * dars allaqachon belgilangan bo'lsa (ustoz tahrirlagan bo'lishi mumkin),
 * hech narsani o'zgartirmaydi — shunchaki qaytadi.
 *
 * Bu guruh sahifasi ochilganda avtomatik chaqiriladi, shuning uchun ustoz
 * «Rejani belgilash»ни qo'lda bosmasa ham reja oldindan to'ldirilган bo'ladi.
 * Xatolik sahifa renderini buzmasligi uchun try/catch ichida.
 */
export async function ensureSyllabusTagged(groupId: string): Promise<void> {
  try {
    const [row] = await sql<{ tagged: number }[]>`
      select count(*)::int as tagged from course_lessons
      where group_id = ${groupId} and syllabus_position is not null
    `;
    if ((row?.tagged ?? 0) > 0) return; // allaqachon belgilangan — tegilmaydi

    const lessons = await sql<{ id: string }[]>`
      select id from course_lessons where group_id = ${groupId}
      order by lesson_date asc nulls last, lesson_number asc
    `;
    if (lessons.length === 0) return;

    for (let i = 0; i < lessons.length; i++) {
      const pos = i + 1;
      await sql`update course_lessons set syllabus_position = ${pos}, lesson_type = ${lessonTypeForPosition(pos)} where id = ${lessons[i].id}`;
    }
  } catch (e) {
    console.error('[syllabus] auto-tag failed', e);
  }
}

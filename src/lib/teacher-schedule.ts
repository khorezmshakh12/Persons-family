import { sql } from '@/lib/db/client';

// Ustoz rollari — ularning KUNLIK checklisti o'sha kuni dars bo'lsagina
// ko'rinadi/talab qilinadi (lesson-plan bilan integratsiya). Haftalik/oylik
// cadence bunga bog'liq emas.
export const TEACHER_ROLES = ['teacher', 'head_teacher', 'assistant'] as const;

export function isTeacherRole(role: string | null | undefined): boolean {
  return !!role && (TEACHER_ROLES as readonly string[]).includes(role);
}

// Guruhlar odd/even haftalik rotatsiyada uchrashadi (lesson-generation.ts bilan
// bir xil): Du/Chor/Juma = 'odd', Se/Pay/Shan = 'even', Yakshanba = dars yo'q.
// dayKey allaqachon Toshkent kalendar sanasi, shuning uchun getUTCDay xavfsiz.
export function weekdayParity(dayKey: string): 'odd' | 'even' | null {
  const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  if (dow === 0) return null; // Yakshanba — hech kimda dars yo'q
  return dow % 2 === 1 ? 'odd' : 'even';
}

/** Ushbu foydalanuvchida (ustoz yoki yordamchi) berilgan kuni dars bormi? */
export async function teacherHasLessonOn(userId: string, dayKey: string): Promise<boolean> {
  const parity = weekdayParity(dayKey);
  if (!parity) return false;
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from groups
    where schedule_type = ${parity}
      and (teacher_id = ${userId} or assigned_ta_id = ${userId})
  `.catch(() => [{ n: 0 }]);
  return (row?.n ?? 0) > 0;
}

/** Berilgan kuni darsi bor barcha ustoz/yordamchilar id'lari (cron hisobot uchun). */
export async function teacherIdsWithLessonOn(dayKey: string): Promise<Set<string>> {
  const parity = weekdayParity(dayKey);
  if (!parity) return new Set();
  const rows = await sql<{ teacher_id: string | null; assigned_ta_id: string | null }[]>`
    select teacher_id, assigned_ta_id from groups where schedule_type = ${parity}
  `.catch(() => []);
  const set = new Set<string>();
  for (const r of rows) {
    if (r.teacher_id) set.add(r.teacher_id);
    if (r.assigned_ta_id) set.add(r.assigned_ta_id);
  }
  return set;
}

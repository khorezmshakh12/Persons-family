'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { askTypeSafe } from '@/lib/typesafe';
import { escapeTelegramText, sendTelegramAs } from '@/lib/telegram';

export type ReviewResult = { error?: string; aiScore?: number | null };

const reviewSchema = z.object({
  lessonId: z.string().uuid(),
  verdict: z.enum(['ok', 'needs_work']),
  note: z.string().trim().max(2000).default(''),
});

/** Head teacher / CEO: mark a plan good, or send it back with a note. */
export async function reviewLessonAction(input: z.input<typeof reviewSchema>): Promise<ReviewResult> {
  let reviewerId: string;
  try {
    ({ user: { id: reviewerId } } = await requireCap('academic.viewAll'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = reviewSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  if (p.data.verdict === 'needs_work' && !p.data.note) return { error: 'noteRequired' };
  try {
    await sql`
      insert into lesson_reviews (lesson_id, reviewer, verdict, note, reviewed_at)
      values (${p.data.lessonId}, ${reviewerId}, ${p.data.verdict}, ${p.data.note || null}, now())
      on conflict (lesson_id) do update set reviewer = excluded.reviewer, verdict = excluded.verdict,
        note = excluded.note, reviewed_at = now()`;
    if (p.data.verdict === 'needs_work') {
      const [row] = await sql<{ telegram_id: number | null; group_name: string; lesson_date: string | null }[]>`
        select t.telegram_id, g.name as group_name, cl.lesson_date::text as lesson_date
        from course_lessons cl join groups g on g.id = cl.group_id join profiles t on t.id = g.teacher_id
        where cl.id = ${p.data.lessonId}`;
      if (row?.telegram_id) {
        await sendTelegramAs('lesson', 
          row.telegram_id,
          `✏️ <b>${escapeTelegramText(row.group_name)}</b> (${row.lesson_date ?? ''}) dars rejasiga izoh:\n${escapeTelegramText(p.data.note)}`,
        ).catch(() => {});
      }
    }
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/lesson-plans', 'page');
  return {};
}

const LEVELS = [
  '1 — vague: generic words, no concrete activity or target language',
  '2 — thin: some intent but key parts are missing or unclear',
  '3 — usable: clear topic and aim, workable activities',
  '4 — strong: specific aim, target language, anticipated problems with fixes',
  '5 — excellent: precise, coherent, ready for any teacher to run',
];

/** Jev's advisory 1–5 score for how clear and usable a plan is. */
export async function aiScoreLessonAction(lessonId: string): Promise<ReviewResult> {
  try {
    await requireCap('academic.viewAll');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(lessonId).success) return { error: 'invalidInput' };
  const [l] = await sql<{ topic: string | null; aim: string | null; language_focus: string | null; anticipated_problems: string | null; materials: string | null; homework: string | null; procedure: unknown; course: string | null }[]>`
    select cl.topic, cl.aim, cl.language_focus, cl.anticipated_problems, cl.materials, cl.homework, cl.procedure, g.course_name as course
    from course_lessons cl join groups g on g.id = cl.group_id where cl.id = ${lessonId}`;
  if (!l) return { error: 'notFound' };
  const res = await askTypeSafe(
    {
      context: 'A lesson plan written by a teacher at Persons, a language/education centre in Uzbekistan. Text may be Uzbek, Russian or English.',
      plan: l,
    },
    { quality: { type: 'score', instructions: 'How clear, specific and ready-to-teach is `plan`?', criteria: LEVELS } },
    'lesson_plan_quality',
  );
  const a = res?.answers.quality;
  if (!a || a.type !== 'score') return { error: 'aiUnavailable' };
  const score = Math.max(1, Math.min(5, Math.round(a.score) + 1));
  await sql`
    insert into lesson_reviews (lesson_id, ai_score, ai_checked_at) values (${lessonId}, ${score}, now())
    on conflict (lesson_id) do update set ai_score = excluded.ai_score, ai_checked_at = now()`;
  return { aiScore: score };
}

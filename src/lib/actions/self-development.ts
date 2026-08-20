'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { TEACHER_LEVELS, type TeacherLevel } from '@/lib/teacher-level';
import { firstOfCurrentMonth } from '@/lib/self-development';

export type SelfDevActionState = { error?: string; success?: boolean } | undefined;

const submitSchema = z.object({
  achievements: z.string().trim().max(4000).optional().or(z.literal('')),
  valueAdded: z.string().trim().max(4000).optional().or(z.literal('')),
});

/** Always submits for the current calendar month — never a client-supplied
 * one — so the (user_id, month) unique constraint means "once per month,
 * for real." */
export async function submitSelfDevelopmentAction(
  _prevState: SelfDevActionState,
  formData: FormData,
): Promise<SelfDevActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (!parsed.data.achievements && !parsed.data.valueAdded) return { error: 'invalidInput' };

  try {
    await sql`
      insert into self_development (user_id, month, achievements, value_added)
      values (${user.id}, ${firstOfCurrentMonth()}, ${parsed.data.achievements || null}, ${parsed.data.valueAdded || null})
    `;
  } catch (error) {
    // 23505 = unique_violation — the (user_id, month) constraint, meaning
    // this month's entry already exists.
    if ((error as { code?: string }).code === '23505') return { error: 'alreadySubmitted' };
    return { error: 'submitFailed' };
  }

  revalidatePath('/[locale]/self-development', 'page');
  return { success: true };
}

// The CEO Evaluation Panel saves the rating, score, and (for a teacher's
// submission) a level change all in one action — one "Save evaluation"
// button, not three separate silent auto-saves. `level` is omitted from
// the form entirely for a non-teacher submission (the Select isn't
// rendered), so it arrives here as undefined and the profiles update is
// skipped rather than attempted with a bogus value.
const saveEvaluationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  ceoRating: z.string().trim().max(2000).optional().or(z.literal('')),
  ceoScore: z.coerce.number().int().min(1).max(100),
  level: z.enum(TEACHER_LEVELS as [string, ...string[]]).optional(),
  bonusAmount: z.coerce.number().min(0).optional(),
});

export async function saveEvaluationAction(
  _prevState: SelfDevActionState,
  formData: FormData,
): Promise<SelfDevActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = saveEvaluationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`
      update self_development set
        ceo_rating = ${parsed.data.ceoRating || null},
        ceo_score = ${parsed.data.ceoScore},
        bonus_amount = ${parsed.data.bonusAmount ?? null}
      where id = ${parsed.data.id}
    `;
  } catch {
    return { error: 'submitFailed' };
  }

  if (parsed.data.level) {
    try {
      await sql`
        update profiles set teacher_level = ${parsed.data.level as TeacherLevel}, level_updated_at = now()
        where id = ${parsed.data.userId}
      `;
    } catch {
      return { error: 'submitFailed' };
    }
  }

  revalidatePath('/[locale]/self-development', 'page');
  revalidatePath('/[locale]/staff', 'page');
  revalidatePath(`/[locale]/finance/${parsed.data.userId}`, 'page');
  return { success: true };
}

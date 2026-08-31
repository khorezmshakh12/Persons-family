'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { TEACHER_LEVELS, type TeacherLevel } from '@/lib/teacher-level';
import { firstOfCurrentMonth } from '@/lib/self-development';
import { insertStarTransaction } from '@/lib/stars-write';
import { bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';

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
  // No upper bound — the CEO awards as many points as they see fit (spec:
  // "100/100 emas, cheksiz bal"). Still an integer and never negative.
  ceoScore: z.coerce.number().int().min(0),
  level: z.enum(TEACHER_LEVELS as [string, ...string[]]).optional(),
  bonusAmount: z.coerce.number().min(0).optional(),
  // Stars the CEO grants for this month's self-development (spec #3a).
  // Separate currency from the score. Treated as the *target* total for
  // this submission — re-saving with a different number tops up or claws
  // back the difference, so it can't double-award.
  starAward: z.coerce.number().int().min(0).optional(),
});

export async function saveEvaluationAction(
  _prevState: SelfDevActionState,
  formData: FormData,
): Promise<SelfDevActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
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

  // Reconcile the star award for this submission to the requested total.
  // The score update already committed, so a stars failure here is logged,
  // not surfaced as an error.
  if (parsed.data.starAward !== undefined) {
    try {
      const [prev] = await sql<{ total: number }[]>`
        select coalesce(sum(delta), 0)::int as total from star_transactions
        where source_type = 'self_development' and source_id = ${parsed.data.id}
      `;
      const diff = parsed.data.starAward - (prev?.total ?? 0);
      if (diff !== 0) {
        await insertStarTransaction(sql, {
          userId: parsed.data.userId,
          delta: diff,
          reason: 'Self-development bahosi',
          sourceType: 'self_development',
          sourceId: parsed.data.id,
          createdBy: ceoId,
        });
        await bumpNavBadgeSignal(parsed.data.userId);
      }
    } catch (error) {
      console.error('self-development star award failed', error instanceof Error ? error.message : error);
    }
  }

  revalidatePath('/[locale]/self-development', 'page');
  revalidatePath('/[locale]/staff', 'page');
  revalidatePath(`/[locale]/finance/${parsed.data.userId}`, 'page');
  return { success: true };
}

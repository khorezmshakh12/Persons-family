'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { TEACHER_LEVELS, type TeacherLevel } from '@/lib/teacher-level';
import { firstOfCurrentMonth } from '@/lib/self-development';
import type { Database } from '@/lib/supabase/types';

export type SelfDevActionState = { error?: string; success?: boolean } | undefined;

type SelfDevelopmentUpdate = Database['public']['Tables']['self_development']['Update'];

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

  const supabase = await createClient();
  const { error } = await supabase.from('self_development').insert({
    user_id: user.id,
    month: firstOfCurrentMonth(),
    achievements: parsed.data.achievements || null,
    value_added: parsed.data.valueAdded || null,
  });
  if (error) {
    if (error.code === '23505') return { error: 'alreadySubmitted' };
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

  const supabase = await createClient();

  const devUpdates: SelfDevelopmentUpdate = {
    ceo_rating: parsed.data.ceoRating || null,
    ceo_score: parsed.data.ceoScore,
    bonus_amount: parsed.data.bonusAmount ?? null,
  };
  const { error: devError } = await supabase
    .from('self_development')
    .update(devUpdates)
    .eq('id', parsed.data.id);
  if (devError) return { error: 'submitFailed' };

  if (parsed.data.level) {
    const { error: levelError } = await supabase
      .from('profiles')
      .update({
        teacher_level: parsed.data.level as TeacherLevel,
        level_updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.userId);
    if (levelError) return { error: 'submitFailed' };
  }

  revalidatePath('/[locale]/self-development', 'page');
  revalidatePath('/[locale]/staff', 'page');
  revalidatePath(`/[locale]/finance/${parsed.data.userId}`, 'page');
  return { success: true };
}

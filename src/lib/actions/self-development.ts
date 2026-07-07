'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { requireAdmin } from '@/lib/auth/require-admin';
import { TEACHER_LEVELS } from '@/lib/teacher-level';
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
  if (!user) return { error: 'forbidden' };

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

const rateSchema = z.object({ id: z.string().uuid(), ceoRating: z.string().trim().max(2000) });

export async function rateSelfDevelopmentAction(
  _prevState: SelfDevActionState,
  formData: FormData,
): Promise<SelfDevActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = rateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('self_development')
    .update({ ceo_rating: parsed.data.ceoRating || null })
    .eq('id', parsed.data.id);
  if (error) return { error: 'submitFailed' };

  revalidatePath('/[locale]/self-development', 'page');
  return { success: true };
}

const upgradeLevelSchema = z.object({
  userId: z.string().uuid(),
  level: z.enum(TEACHER_LEVELS as [string, ...string[]]),
});

export async function upgradeTeacherLevelAction(
  _prevState: SelfDevActionState,
  formData: FormData,
): Promise<SelfDevActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = upgradeLevelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      teacher_level: parsed.data.level as (typeof TEACHER_LEVELS)[number],
      level_updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.userId);
  if (error) return { error: 'submitFailed' };

  revalidatePath('/[locale]/self-development', 'page');
  revalidatePath('/[locale]/staff', 'page');
  return { success: true };
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

export type LessonPlanActionState = { error?: string } | undefined;

const updateDaySchema = z.object({
  dayId: z.string().uuid(),
  topic: z.string().trim().max(300).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function updateLessonPlanDayAction(
  _prevState: LessonPlanActionState,
  formData: FormData,
): Promise<LessonPlanActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = updateDaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('lesson_plan_days')
    .update({ topic: parsed.data.topic || null, notes: parsed.data.notes || null })
    .eq('id', parsed.data.dayId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

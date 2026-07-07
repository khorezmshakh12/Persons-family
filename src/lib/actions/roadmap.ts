'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import type { Database } from '@/lib/supabase/types';

export type RoadmapActionState = { error?: string; success?: boolean } | undefined;

type RoadmapGoalUpdate = Database['public']['Tables']['roadmap_goals']['Update'];

const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  timeframe: z.enum(['weekly', 'monthly', 'quarterly']),
});

export async function createGoalAction(
  _prevState: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = createGoalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('roadmap_goals').insert(parsed.data);
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/roadmap', 'page');
  return { success: true };
}

// Every field here is independently optional — each control (the status
// Select, the progress slider, the failure-details form) builds its own
// FormData with only the one or two fields it owns, so a slider drag never
// clobbers a status change made a moment earlier, or vice versa.
const updateGoalSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'done', 'failed']).optional(),
  progressPercentage: z.coerce.number().int().min(0).max(100).optional(),
  failureReason: z.string().trim().max(2000).optional(),
  solution: z.string().trim().max(2000).optional(),
});

export async function updateGoalAction(
  _prevState: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = updateGoalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const updates: RoadmapGoalUpdate = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.progressPercentage !== undefined) updates.progress_percentage = parsed.data.progressPercentage;
  if (parsed.data.failureReason !== undefined) updates.failure_reason = parsed.data.failureReason || null;
  if (parsed.data.solution !== undefined) updates.solution = parsed.data.solution || null;
  if (Object.keys(updates).length === 0) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('roadmap_goals').update(updates).eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/roadmap', 'page');
  return { success: true };
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteGoalAction(formData: FormData): Promise<void> {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from('roadmap_goals').delete().eq('id', parsed.data.id);

  revalidatePath('/[locale]/roadmap', 'page');
}

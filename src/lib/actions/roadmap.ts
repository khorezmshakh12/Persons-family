'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeoOrAdminManager, authErrorCode } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { logSystemAction } from '@/lib/audit-log';

export type RoadmapActionState = { error?: string } | undefined;

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  timeframe: z.enum(['weekly', 'monthly', 'quarterly']),
});

export async function createRoadmapGoalAction(
  _prevState: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  try {
    await requireCeoOrAdminManager();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('roadmap_goals').insert({
    title: parsed.data.title,
    timeframe: parsed.data.timeframe,
  });
  if (error) return { error: 'updateFailed' };

  logSystemAction(supabase, 'roadmap.create', `Added roadmap goal "${parsed.data.title}" (${parsed.data.timeframe})`);

  revalidatePath('/[locale]/roadmap', 'page');
  return {};
}

const updateSchema = z.object({
  goalId: z.string().uuid(),
  status: z.enum(['pending', 'done', 'failed']),
  progressPercentage: z.coerce.number().int().min(0).max(100),
  solution: z.string().trim().max(2000).optional().or(z.literal('')),
  failureReason: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function updateRoadmapGoalAction(
  _prevState: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  try {
    await requireCeoOrAdminManager();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('roadmap_goals')
    .update({
      status: parsed.data.status,
      progress_percentage: parsed.data.progressPercentage,
      solution: parsed.data.solution || null,
      failure_reason: parsed.data.failureReason || null,
    })
    .eq('id', parsed.data.goalId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/roadmap', 'page');
  return {};
}

const deleteSchema = z.object({ goalId: z.string().uuid() });

export async function deleteRoadmapGoalAction(
  _prevState: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  try {
    await requireCeoOrAdminManager();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('roadmap_goals').delete().eq('id', parsed.data.goalId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/roadmap', 'page');
  return {};
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeoOrAdminManager, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
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

  try {
    await sql`insert into roadmap_goals (title, timeframe) values (${parsed.data.title}, ${parsed.data.timeframe})`;
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction('roadmap.create', `Added roadmap goal "${parsed.data.title}" (${parsed.data.timeframe})`);

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

  try {
    await sql`
      update roadmap_goals set
        status = ${parsed.data.status},
        progress_percentage = ${parsed.data.progressPercentage},
        solution = ${parsed.data.solution || null},
        failure_reason = ${parsed.data.failureReason || null}
      where id = ${parsed.data.goalId}
    `;
  } catch {
    return { error: 'updateFailed' };
  }

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

  try {
    await sql`delete from roadmap_goals where id = ${parsed.data.goalId}`;
  } catch {
    return { error: 'updateFailed' };
  }

  revalidatePath('/[locale]/roadmap', 'page');
  return {};
}

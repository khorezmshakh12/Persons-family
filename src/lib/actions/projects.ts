'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeoOrAdminManager, authErrorCode } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { logSystemAction } from '@/lib/audit-log';

export type ProjectActionState = { error?: string } | undefined;

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  steps: z.string().trim().max(4000).optional().or(z.literal('')),
  estimatedBudget: z.string().trim().optional().or(z.literal('')),
});

/** initial_steps is stored as a jsonb array of strings — the form just
 * collects one step per line and splits it here rather than needing a
 * dynamic repeatable-field UI for what's a short planning list. */
function stepsToArray(raw: string | undefined) {
  return (raw ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createProjectAction(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await requireCeoOrAdminManager();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const budget = parsed.data.estimatedBudget ? Number(parsed.data.estimatedBudget) : null;
  if (parsed.data.estimatedBudget && (budget === null || Number.isNaN(budget))) {
    return { error: 'invalidInput' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('future_projects').insert({
    title: parsed.data.title,
    initial_steps: stepsToArray(parsed.data.steps),
    estimated_budget: budget,
  });
  if (error) return { error: 'updateFailed' };

  logSystemAction(supabase, 'projects.create', `Added project "${parsed.data.title}"`);

  revalidatePath('/[locale]/projects', 'page');
  return {};
}

const deleteSchema = z.object({ projectId: z.string().uuid() });

export async function deleteProjectAction(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await requireCeoOrAdminManager();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('future_projects').delete().eq('id', parsed.data.projectId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/projects', 'page');
  return {};
}

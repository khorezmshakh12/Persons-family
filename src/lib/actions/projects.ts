'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';

export type ProjectActionState = { error?: string; success?: boolean } | undefined;

export type ProjectStep = { id: string; text: string; done: boolean };

const createProjectSchema = z.object({ title: z.string().trim().min(1).max(200) });

export async function createProjectAction(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = createProjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('future_projects').insert({ title: parsed.data.title, initial_steps: [] });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/projects', 'page');
  return { success: true };
}

const stepSchema = z.object({ id: z.string(), text: z.string().trim().min(1).max(300), done: z.boolean() });
const updateStepsSchema = z.object({
  id: z.string().uuid(),
  steps: z.string(), // JSON-encoded ProjectStep[]
});

/** Full-array replace, same as course_lessons' attachments list — the
 * client always sends the complete, already-edited steps array rather than
 * a single delta, since JSONB has no native "append/remove one element"
 * operation through PostgREST. */
export async function updateProjectStepsAction(id: string, steps: ProjectStep[]): Promise<ProjectActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = updateStepsSchema.safeParse({ id, steps: JSON.stringify(steps) });
  if (!parsed.success) return { error: 'invalidInput' };

  let parsedSteps: unknown;
  try {
    parsedSteps = JSON.parse(parsed.data.steps);
  } catch {
    return { error: 'invalidInput' };
  }
  const stepsResult = z.array(stepSchema).safeParse(parsedSteps);
  if (!stepsResult.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('future_projects')
    .update({ initial_steps: stepsResult.data })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/projects', 'page');
  return { success: true };
}

const updateBudgetSchema = z.object({
  id: z.string().uuid(),
  estimatedBudget: z.string().optional().or(z.literal('')),
});

export async function updateProjectBudgetAction(
  _prevState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = updateBudgetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const budget = parsed.data.estimatedBudget ? Number(parsed.data.estimatedBudget) : null;
  if (budget !== null && !Number.isFinite(budget)) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('future_projects')
    .update({ estimated_budget: budget })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/projects', 'page');
  return { success: true };
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteProjectAction(formData: FormData): Promise<void> {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from('future_projects').delete().eq('id', parsed.data.id);

  revalidatePath('/[locale]/projects', 'page');
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

export type TaskActionState = { error?: string } | undefined;

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  assignedTo: z.string().uuid(),
  dueDate: z.string().optional().or(z.literal('')),
});

export async function assignTaskAction(
  _prevState: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  let actingUserId: string;
  try {
    const { user } = await requireAdmin();
    actingUserId = user.id;
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('tasks').insert({
    title: parsed.data.title,
    description: parsed.data.description || null,
    assigned_to: parsed.data.assignedTo,
    assigned_by: actingUserId,
    due_date: parsed.data.dueDate || null,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

const updateTaskSchema = taskSchema.extend({ id: z.string().uuid() });

export async function updateTaskAction(
  _prevState: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = updateTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('tasks')
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      assigned_to: parsed.data.assignedTo,
      due_date: parsed.data.dueDate || null,
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

const STATUSES = ['pending', 'in_progress', 'done'] as const;

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export type UpdateTaskStatusResult = { error?: string };

export async function updateTaskStatusAction(formData: FormData): Promise<UpdateTaskStatusResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = updateStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('tasks').update({ status: parsed.data.status }).eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteTaskAction(formData: FormData): Promise<void> {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from('tasks').delete().eq('id', parsed.data.id);

  revalidatePath('/[locale]/tasks', 'page');
}

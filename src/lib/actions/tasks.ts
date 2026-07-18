'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { allowedTaskAssigneeRoles } from '@/lib/task-roles';
import type { StaffRole } from '@/lib/nav';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';

export type TaskActionState = { error?: string } | undefined;

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: 'Kutilmoqda',
  in_progress: 'Jarayonda',
  done: 'Bajarildi',
};

/** Fire-and-forget notification to the assignee — never let a Telegram
 * hiccup affect the response to the admin who just assigned/edited the
 * task (mirrors notifyIssueCreated in actions/issues.ts). */
async function notifyTaskAssigned({
  title,
  status,
  assigneeTelegramId,
}: {
  title: string;
  status: string;
  assigneeTelegramId: number | null;
}) {
  if (!assigneeTelegramId) return;
  try {
    const text = `Sizga yangi vazifa biriktirildi: <b>${escapeTelegramText(title)}</b>\nHolati: ${TASK_STATUS_LABELS[status] ?? escapeTelegramText(status)}`;
    await sendTelegramMessage(assigneeTelegramId, text);
  } catch (err) {
    console.error('Failed to send task assignment Telegram notification:', err);
  }
}

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
  let actingRole: StaffRole;
  try {
    const { user, profile } = await requireAdmin();
    actingUserId = user.id;
    actingRole = profile.role;
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();

  // Strict chain of command, re-checked here regardless of what the
  // client's dropdown offered — the dropdown options alone are not a
  // security boundary (mirrors createIssueAction's re-validation).
  const { data: target } = await supabase
    .from('profiles')
    .select('role, telegram_id')
    .eq('id', parsed.data.assignedTo)
    .maybeSingle();
  if (!target || !allowedTaskAssigneeRoles(actingRole).includes(target.role)) {
    return { error: 'invalidAssignee' };
  }

  const { error } = await supabase.from('tasks').insert({
    title: parsed.data.title,
    description: parsed.data.description || null,
    assigned_to: parsed.data.assignedTo,
    assigned_by: actingUserId,
    due_date: parsed.data.dueDate || null,
  });
  if (error) return { error: 'createFailed' };

  void notifyTaskAssigned({ title: parsed.data.title, status: 'pending', assigneeTelegramId: target.telegram_id });

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

const updateTaskSchema = taskSchema.extend({ id: z.string().uuid() });

export async function updateTaskAction(
  _prevState: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  let actingUserId: string;
  let actingRole: StaffRole;
  try {
    const { user, profile } = await requireAdmin();
    actingUserId = user.id;
    actingRole = profile.role;
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = updateTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();

  // Strict visibility mirrors tasks_select: only the admin who originally
  // assigned this task may rewrite it, not every admin in the company.
  const { data: existing } = await supabase
    .from('tasks')
    .select('assigned_by, status')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!existing || existing.assigned_by !== actingUserId) return { error: 'forbidden' };

  const { data: target } = await supabase
    .from('profiles')
    .select('role, telegram_id')
    .eq('id', parsed.data.assignedTo)
    .maybeSingle();
  if (!target || !allowedTaskAssigneeRoles(actingRole).includes(target.role)) {
    return { error: 'invalidAssignee' };
  }

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

  void notifyTaskAssigned({ title: parsed.data.title, status: existing.status, assigneeTelegramId: target.telegram_id });

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

export type DeleteTaskResult = { error?: string };

/** Deletion is restricted to the task's own creator — tasks_delete_own
 * mirrors this at the RLS layer, so this check is defense in depth, not the
 * only thing standing between another admin and someone else's task. */
export async function deleteTaskAction(formData: FormData): Promise<DeleteTaskResult> {
  let actingUserId: string;
  try {
    const { user } = await requireAdmin();
    actingUserId = user.id;
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: existing } = await supabase.from('tasks').select('assigned_by').eq('id', parsed.data.id).maybeSingle();
  if (!existing || existing.assigned_by !== actingUserId) return { error: 'forbidden' };

  const { error } = await supabase.from('tasks').delete().eq('id', parsed.data.id);
  if (error) return { error: 'deleteFailed' };

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

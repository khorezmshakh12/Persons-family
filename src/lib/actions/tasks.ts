'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { ForbiddenError } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { allowedTaskAssigneeRoles } from '@/lib/task-roles';
import type { StaffRole } from '@/lib/nav';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';

export type TaskActionState = { error?: string } | undefined;

/** The CEO can assign a task to anyone eligible; IT Developer's only
 * assigning power is the narrow admin_manager-only carve-out in
 * allowedTaskAssigneeRoles (re-validated below regardless of who's
 * calling), symmetric to its account-creation power in staff.ts. */
async function requireTaskAssigner() {
  const { user, profile } = await getAuthState();
  if (!user || !profile || (profile.role !== 'ceo' && profile.role !== 'it_developer')) {
    throw new ForbiddenError('Task assignment access required');
  }
  return { user, profile };
}

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
  deadline,
  assigneeTelegramId,
}: {
  title: string;
  status: string;
  deadline: string;
  assigneeTelegramId: number | null;
}) {
  if (!assigneeTelegramId) return;
  try {
    const deadlineLabel = new Date(deadline).toLocaleString('uz-UZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const text = `Sizga yangi vazifa biriktirildi: <b>${escapeTelegramText(title)}</b>\nHolati: ${TASK_STATUS_LABELS[status] ?? escapeTelegramText(status)}\nMuddati: ${escapeTelegramText(deadlineLabel)}`;
    await sendTelegramMessage(assigneeTelegramId, text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  assignedTo: z.string().uuid(),
  deadline: z.string().min(1),
});

export async function assignTaskAction(
  _prevState: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  let actingUserId: string;
  let actingRole: StaffRole;
  try {
    const { user, profile } = await requireTaskAssigner();
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
  console.log('Users retrieved from DB for notifications:', target);
  if (!target || !allowedTaskAssigneeRoles(actingRole).includes(target.role)) {
    return { error: 'invalidAssignee' };
  }

  const { error } = await supabase.from('tasks').insert({
    title: parsed.data.title,
    description: parsed.data.description || null,
    assigned_to: parsed.data.assignedTo,
    assigned_by: actingUserId,
    deadline: parsed.data.deadline,
  });
  if (error) return { error: 'createFailed' };

  // See staff-chats.ts's `after()` comment — Vercel can tear down a bare
  // un-awaited fire-and-forget call before its Telegram send finishes.
  after(() =>
    notifyTaskAssigned({
      title: parsed.data.title,
      status: 'pending',
      deadline: parsed.data.deadline,
      assigneeTelegramId: target.telegram_id,
    }),
  );

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
    const { user, profile } = await requireTaskAssigner();
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
  console.log('Users retrieved from DB for notifications:', target);
  if (!target || !allowedTaskAssigneeRoles(actingRole).includes(target.role)) {
    return { error: 'invalidAssignee' };
  }

  const { error } = await supabase
    .from('tasks')
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      assigned_to: parsed.data.assignedTo,
      deadline: parsed.data.deadline,
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  after(() =>
    notifyTaskAssigned({
      title: parsed.data.title,
      status: existing.status,
      deadline: parsed.data.deadline,
      assigneeTelegramId: target.telegram_id,
    }),
  );

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
  const { error } = await supabase
    .from('tasks')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id);
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
    const { user } = await requireTaskAssigner();
    actingUserId = user.id;
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('tasks')
    .select('assigned_by')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!existing || existing.assigned_by !== actingUserId) return { error: 'forbidden' };

  const { error } = await supabase.from('tasks').delete().eq('id', parsed.data.id);
  if (error) return { error: 'deleteFailed' };

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

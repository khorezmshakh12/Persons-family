'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { ForbiddenError } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { allowedTaskAssigneeRoles } from '@/lib/task-roles';
import type { StaffRole } from '@/lib/nav';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { bumpBoardSignal, bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';

export type TaskActionState = { error?: string } | undefined;

/** CEO-only — IT Developer lost task assignment/edit/delete entirely
 * (previously shared this with the CEO via a narrow admin_manager-only
 * carve-out). */
async function requireTaskAssigner() {
  const { user, profile } = await getAuthState();
  if (!user || !profile || profile.role !== 'ceo') {
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
    // Cloud Run's container clock is UTC, and Intl formatting defaults to
    // the runtime's own timezone when none is given — without an explicit
    // timeZone this rendered every deadline 5 hours behind actual Tashkent
    // time.
    const deadlineLabel = new Date(deadline).toLocaleString('uz-UZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Tashkent',
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

  // Strict chain of command, re-checked here regardless of what the
  // client's dropdown offered — the dropdown options alone are not a
  // security boundary (mirrors createIssueAction's re-validation).
  const [target] = await sql<{ role: StaffRole; telegram_id: number | null }[]>`
    select role, telegram_id from profiles where id = ${parsed.data.assignedTo}
  `;
  if (!target || !allowedTaskAssigneeRoles(actingRole).includes(target.role)) {
    return { error: 'invalidAssignee' };
  }

  await sql`
    insert into tasks (title, description, assigned_to, assigned_by, deadline)
    values (${parsed.data.title}, ${parsed.data.description || null}, ${parsed.data.assignedTo}, ${actingUserId}, ${parsed.data.deadline})
  `;

  await bumpBoardSignal('tasks');
  await bumpNavBadgeSignal(parsed.data.assignedTo);

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

  // Strict visibility mirrors tasks_select: only the admin who originally
  // assigned this task may rewrite it, not every admin in the company.
  const [existing] = await sql<{ assigned_by: string; assigned_to: string; status: string }[]>`
    select assigned_by, assigned_to, status from tasks where id = ${parsed.data.id}
  `;
  if (!existing || existing.assigned_by !== actingUserId) return { error: 'forbidden' };

  const [target] = await sql<{ role: StaffRole; telegram_id: number | null }[]>`
    select role, telegram_id from profiles where id = ${parsed.data.assignedTo}
  `;
  if (!target || !allowedTaskAssigneeRoles(actingRole).includes(target.role)) {
    return { error: 'invalidAssignee' };
  }

  // Mirrors the old reset_task_seen_on_reassign trigger: a genuine
  // reassignment (not just re-saving the same assignee) clears is_seen so
  // the new assignee's nav dot lights back up, same as a brand-new task.
  const reassigned = parsed.data.assignedTo !== existing.assigned_to;

  await sql`
    update tasks set
      title = ${parsed.data.title},
      description = ${parsed.data.description || null},
      assigned_to = ${parsed.data.assignedTo},
      deadline = ${parsed.data.deadline}
      ${reassigned ? sql`, is_seen = false` : sql``}
    where id = ${parsed.data.id}
  `;

  await bumpBoardSignal('tasks');
  await bumpNavBadgeSignal(parsed.data.assignedTo);
  if (reassigned) await bumpNavBadgeSignal(existing.assigned_to);

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

/** Only the assignee may change their own task's status — mirrors the old
 * protect_task_fields trigger's `auth.uid() <> new.assigned_to` check,
 * which no longer exists as a DB-level guard now that there's no
 * database-side trigger layer; this app-layer check is now the only thing
 * enforcing it, not defense in depth on top of one. */
export async function updateTaskStatusAction(formData: FormData): Promise<UpdateTaskStatusResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = updateStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [existing] = await sql<{ assigned_to: string }[]>`select assigned_to from tasks where id = ${parsed.data.id}`;
  if (!existing || existing.assigned_to !== user.id) return { error: 'forbidden' };

  await sql`update tasks set status = ${parsed.data.status} where id = ${parsed.data.id}`;

  await bumpBoardSignal('tasks');

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

export type VisibleTaskRow = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  deadline: string;
  status: (typeof STATUSES)[number];
  updated_at: string;
};

/**
 * Re-fetch for TaskBoard's live refresh, triggered whenever
 * board_signals/tasks changes in Firestore (see lib/gcp/firestoreAdmin.ts's
 * bumpBoardSignal) — Firestore only carries an empty "something changed"
 * signal, no row payload, so the client re-derives the whole visible list
 * from here rather than trying to patch one row in place. Mirrors
 * app/[locale]/(app)/tasks/page.tsx's own query exactly: only the task's
 * creator or assignee may see it, and a "done" task older than a week is
 * hidden (not deleted) to keep the board from accumulating forever.
 */
export async function getVisibleTasksAction(): Promise<VisibleTaskRow[]> {
  const { user } = await getAuthState();
  if (!user) return [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  return sql<VisibleTaskRow[]>`
    select id, title, description, assigned_to, assigned_by, deadline, status, updated_at
    from tasks
    where (assigned_by = ${user.id} or assigned_to = ${user.id})
      and (status <> 'done' or updated_at >= ${sevenDaysAgo})
    order by created_at desc
  `;
}

const idSchema = z.object({ id: z.string().uuid() });

export type DeleteTaskResult = { error?: string };

/** Deletion is restricted to the task's own creator — this app-layer check
 * is now the only thing enforcing that (previously RLS-backed too). */
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

  const [existing] = await sql<{ assigned_by: string }[]>`select assigned_by from tasks where id = ${parsed.data.id}`;
  if (!existing || existing.assigned_by !== actingUserId) return { error: 'forbidden' };

  await sql`delete from tasks where id = ${parsed.data.id}`;

  await bumpBoardSignal('tasks');

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getFormatter } from 'next-intl/server';
import { ForbiddenError } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { allowedTaskAssigneeRoles } from '@/lib/task-roles';
import { efficiencyForMonth, type EfficiencyStats } from '@/lib/task-efficiency';
import type { StaffRole } from '@/lib/nav';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { bumpBoardSignal, bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';
import { insertStarTransaction } from '@/lib/stars-write';
import {
  TASK_ATTACHMENT_PREFIX,
  TASK_OPEN_STATUSES,
  TASK_REJECTION_REASON_MAX_LENGTH,
  TASK_REJECTION_REASON_MIN_LENGTH,
  isTaskUnderReview,
  taskAttachmentKindForMime,
  type TaskStatus,
} from '@/lib/task-status';
import { createSignedWriteUrl } from '@/lib/gcp/storage';

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
  submitted: 'Tekshiruvda',
  awaiting_upload: 'Fayl kutilmoqda',
  done: 'Bajarildi',
};

/** Every Telegram send in this file is awaited inline rather than dispatched
 * through `after()` — see notifyTaskAssigned's comment for the Cloud Run
 * CPU-throttling reason, and the PR description for why this deliberately
 * differs from warnings.ts. Each helper swallows its own errors so a
 * Telegram hiccup can never turn a committed status change into an error. */
async function notifyTelegram(telegramId: number | null, text: string) {
  if (!telegramId) return;
  try {
    await sendTelegramMessage(telegramId, text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

/** Notification to the assignee. Swallows its own errors, so a Telegram
 * hiccup can never affect the response to the admin who just assigned or
 * edited the task (mirrors notifyIssueAssigned in actions/issues.ts).
 *
 * Awaited inline by its callers, deliberately NOT dispatched through
 * `after()`. `after()` was the correct fix on Vercel, where it maps to the
 * platform's `waitUntil` and extends the invocation until the send settles
 * (see 3a0960d) — but production moved to Cloud Run in 4fa7c88. Next's own
 * docs (node_modules/next/dist/docs, guides/self-hosting#after) list
 * `after` as supported on a Node/Docker server, with the caveat that the
 * platform must "allow a configurable drain period (10-30 seconds is
 * recommended) to ensure all background work completes". Cloud Run does
 * the opposite by default: it throttles a container's CPU to ~0 the
 * instant a request finishes (the deploy in cloudbuild.yaml passes no
 * --no-cpu-throttling), so the callback gets essentially no CPU and the
 * in-flight fetch to api.telegram.org stalls until the instance is reaped.
 * That is why the deadline-reminder cron kept delivering while this never
 * did: the cron awaits its sends mid-request. Awaiting costs one round
 * trip and is the only thing that makes delivery reliable here without an
 * infrastructure change. */
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
  // Optional star bounty the CEO attaches to a task; paid out to the
  // assignee once, the first time the task reaches `done` (see
  // updateTaskStatusAction). No upper bound — stars are deliberately
  // uncapped. 0 / omitted = no reward.
  starReward: z.coerce.number().int().min(0).optional(),
  // The mirror image of starReward: deducted from the assignee once, the
  // first time the task reaches `done` *after* its deadline (see
  // updateTaskStatusAction). Stored as a positive magnitude — the sign is
  // applied at ledger-write time. 0 / omitted = no penalty.
  starPenalty: z.coerce.number().int().min(0).optional(),
  // "Xodim faylni yuklashi shart" — when set, the CEO's approval does not
  // finish the task: it moves to `awaiting_upload` and the assignee has to
  // attach their proof file/audio before it becomes `done` (see
  // approveTaskAction / uploadTaskProofAction). A checkbox posts the literal
  // string 'on' when ticked and nothing at all when not.
  requiresProof: z
    .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
    .optional()
    .transform((value) => value === 'on' || value === 'true'),
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

  try {
    await sql`
      insert into tasks (title, description, assigned_to, assigned_by, deadline, star_reward, star_penalty, requires_proof)
      values (${parsed.data.title}, ${parsed.data.description || null}, ${parsed.data.assignedTo}, ${actingUserId}, ${parsed.data.deadline}, ${parsed.data.starReward ?? 0}, ${parsed.data.starPenalty ?? 0}, ${parsed.data.requiresProof})
    `;
  } catch (error) {
    console.error('assignTaskAction failed', error instanceof Error ? error.message : error);
    return { error: 'createFailed' };
  }

  await bumpBoardSignal('tasks');
  await bumpNavBadgeSignal(parsed.data.assignedTo);

  // Awaited, not `after()`ed — see notifyTaskAssigned's comment.
  await notifyTaskAssigned({
    title: parsed.data.title,
    status: 'pending',
    deadline: parsed.data.deadline,
    assigneeTelegramId: target.telegram_id,
  });

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

  // `updated_at` was never written after insert (AUD-20), so it silently
  // stayed at the row's creation instant forever — every task edit now
  // stamps it, the same as the status change below.
  try {
    await sql`
      update tasks set
        title = ${parsed.data.title},
        description = ${parsed.data.description || null},
        assigned_to = ${parsed.data.assignedTo},
        deadline = ${parsed.data.deadline},
        -- Freely editable right up until the CEO approves: after that the
        -- flag has already decided whether the task went to done or to
        -- awaiting_upload, and flipping it would strand the card.
        requires_proof = case when reviewed_at is null then ${parsed.data.requiresProof} else requires_proof end,
        updated_at = now()
        -- Only adjustable while the bounty hasn't been paid out yet.
        ${parsed.data.starReward !== undefined ? sql`, star_reward = case when star_awarded_at is null then ${parsed.data.starReward} else star_reward end` : sql``}
        -- Same rule for the fine: once it has actually been deducted, the
        -- ledger entry is the record and the amount stops being editable.
        ${parsed.data.starPenalty !== undefined ? sql`, star_penalty = case when star_penalty_applied_at is null then ${parsed.data.starPenalty} else star_penalty end` : sql``}
        ${reassigned ? sql`, is_seen = false` : sql``}
      where id = ${parsed.data.id}
    `;
  } catch (error) {
    console.error('updateTaskAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  await bumpBoardSignal('tasks');
  await bumpNavBadgeSignal(parsed.data.assignedTo);
  if (reassigned) await bumpNavBadgeSignal(existing.assigned_to);

  // Awaited, not `after()`ed — see notifyTaskAssigned's comment.
  await notifyTaskAssigned({
    title: parsed.data.title,
    status: existing.status,
    deadline: parsed.data.deadline,
    assigneeTelegramId: target.telegram_id,
  });

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

/** What a *drag* may ask for. `submitted` / `awaiting_upload` are reached by
 * the workflow actions below, never by dropping a card, and `done` is
 * accepted here only to be rewritten to `submitted` — see
 * updateTaskStatusAction. */
const STATUSES = ['pending', 'in_progress', 'done'] as const;

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export type UpdateTaskStatusResult = { error?: string };

/** The columns every workflow action needs to make its decision. */
type TaskLifecycleRow = {
  assigned_to: string;
  assigned_by: string;
  title: string;
  status: string;
  deadline: string;
  requires_proof: boolean;
  star_penalty: number;
  star_penalty_applied_at: string | null;
};

function selectLifecycleRow(id: string) {
  return sql<TaskLifecycleRow[]>`
    select assigned_to, assigned_by, title, status, deadline,
           requires_proof, star_penalty, star_penalty_applied_at
    from tasks where id = ${id}
  `;
}

async function telegramIdFor(userId: string): Promise<number | null> {
  const [row] = await sql<{ telegram_id: number | null }[]>`
    select telegram_id from profiles where id = ${userId}
  `;
  return row?.telegram_id ?? null;
}

async function displayNameFor(userId: string): Promise<string> {
  const [row] = await sql<{ first_name: string | null; last_name: string | null }[]>`
    select first_name, last_name from profiles where id = ${userId}
  `;
  return `${row?.first_name ?? ''} ${row?.last_name ?? ''}`.trim() || 'Xodim';
}

/**
 * Move a task into `submitted` and tell the CEO it is waiting on them.
 *
 * Shared by submitTaskAction and updateTaskStatusAction's done-drag, so the
 * two entry points cannot drift: whichever way the assignee says "I'm
 * finished", the same row shape lands in the database.
 *
 * Note what is deliberately *not* written: `completed_at` stays null. A
 * submitted task is not a completed task — the monthly archive, the weekly
 * bot and the efficiency stats all key off `completed_at`, and only the
 * CEO's approval is allowed to stamp it.
 */
async function transitionToSubmitted(
  taskId: string,
  existing: TaskLifecycleRow,
  actorId: string,
): Promise<UpdateTaskStatusResult> {
  try {
    await sql`
      update tasks set
        status = 'submitted',
        submitted_at = now(),
        completed_at = null,
        -- A resubmission answers the previous rejection: clear the verdict
        -- so the card stops showing a stale "rejected because…" banner.
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null,
        updated_at = now()
      where id = ${taskId} and assigned_to = ${actorId}
    `;
  } catch (error) {
    console.error('transitionToSubmitted failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  await bumpBoardSignal('tasks');
  await bumpNavBadgeSignal(existing.assigned_by);

  const [ceoTelegramId, actorName] = await Promise.all([
    telegramIdFor(existing.assigned_by),
    displayNameFor(actorId),
  ]);
  await notifyTelegram(
    ceoTelegramId,
    `<b>${escapeTelegramText(actorName)}</b> "${escapeTelegramText(existing.title)}" vazifasini tekshiruvga yubordi.`,
  );

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

/**
 * Stars settle exactly once, on the first transition into `done`, and the
 * deadline decides which way they go: finished on time and the CEO's bounty
 * is paid out, finished late and their fine is deducted instead. The two are
 * mutually exclusive — a late task earns nothing, it only costs.
 *
 * Each branch's `… is null` guard lives in the WHERE, so "settle once" stays
 * atomic under a double-click or a retry: at most one caller gets a row back
 * and therefore writes the ledger entry. That same guard is what makes this
 * safe alongside rejectTaskAction (which may already have charged the fine)
 * and the task-overdue-penalties cron.
 *
 * Never throws: the status change that called it has already committed, and
 * a stars hiccup must not turn a successful approval into an error.
 */
async function settleTaskStars({
  taskId,
  assignedTo,
  assignedBy,
  deadline,
  completedInstant,
}: {
  taskId: string;
  assignedTo: string;
  assignedBy: string;
  deadline: string | null;
  completedInstant: string | null;
}): Promise<void> {
  // No stamp back (the row vanished mid-flight) or no deadline to judge
  // against: fall back to treating it as on time, so a data oddity can never
  // invent a fine nobody earned.
  const completedMs = completedInstant ? new Date(completedInstant).getTime() : Date.now();
  const deadlineMs = deadline ? new Date(deadline).getTime() : Number.NaN;
  const isLate = Number.isFinite(deadlineMs) && completedMs > deadlineMs;

  try {
    if (isLate) {
      const [applied] = await sql<{ star_penalty: number }[]>`
        update tasks set star_penalty_applied_at = now()
        where id = ${taskId} and star_penalty > 0 and star_penalty_applied_at is null
        returning star_penalty
      `;
      if (applied) {
        await insertStarTransaction(sql, {
          userId: assignedTo,
          // The column holds a positive magnitude; the ledger is what
          // carries the sign (insertStarTransaction takes a negative delta —
          // same shape as a CEO deduction or a Market purchase).
          delta: -applied.star_penalty,
          reason: 'Vazifa kech bajarildi',
          sourceType: 'task',
          sourceId: taskId,
          createdBy: assignedBy,
        });
        await bumpNavBadgeSignal(assignedTo);
      }
    } else {
      const [awarded] = await sql<{ star_reward: number }[]>`
        update tasks set star_awarded_at = now()
        where id = ${taskId} and star_reward > 0 and star_awarded_at is null
        returning star_reward
      `;
      if (awarded) {
        await insertStarTransaction(sql, {
          userId: assignedTo,
          delta: awarded.star_reward,
          reason: 'Vazifa bajarildi',
          sourceType: 'task',
          sourceId: taskId,
          createdBy: assignedBy,
        });
        await bumpNavBadgeSignal(assignedTo);
      }
    }
  } catch (error) {
    console.error('task star settlement failed', error instanceof Error ? error.message : error);
  }
}

/**
 * The single place a task becomes `done`. Stamps `completed_at` from the
 * database clock and settles stars against it.
 *
 * `completed_at` comes back out of the same statement that wrote it, so the
 * on-time/late decision is made against the instant Postgres actually
 * stamped — not a second, slightly different read of a different (Node)
 * clock. Both it and `deadline` are timestamptz, i.e. absolute instants, so
 * the comparison is zone-free and needs no Tashkent helper.
 */
async function finalizeTaskDone(
  taskId: string,
  existing: TaskLifecycleRow,
): Promise<{ error?: string }> {
  let completedInstant: string | null = null;
  try {
    const [updated] = await sql<{ completed_at: string | null }[]>`
      update tasks set
        status = 'done',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where id = ${taskId}
      returning completed_at
    `;
    completedInstant = updated?.completed_at ?? null;
  } catch (error) {
    console.error('finalizeTaskDone failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  await settleTaskStars({
    taskId,
    assignedTo: existing.assigned_to,
    assignedBy: existing.assigned_by,
    deadline: existing.deadline,
    completedInstant,
  });

  return {};
}

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

  const [existing] = await selectLifecycleRow(parsed.data.id);
  if (!existing || existing.assigned_to !== user.id) return { error: 'forbidden' };

  // Handed in and parked on the CEO's desk — the assignee cannot pull it
  // back, and nothing about it may change until approve/reject decides. This
  // is also the half of "no penalty while under review" that lives on the
  // request path; the cron half is in task-overdue-penalties/route.ts.
  if (isTaskUnderReview(existing.status)) return { error: 'underReview' };

  // Dropping a card in the done column no longer completes it. It hands the
  // work in: status becomes `submitted`, the CEO is pinged, and no star —
  // reward or fine — settles yet. The one previously-terminal transition in
  // this action is gone, which is why the whole star-settlement block moved
  // out to settleTaskStars (now reached only via approve / proof upload).
  if (parsed.data.status === 'done') {
    if (existing.status === 'done') return {}; // already terminal, nothing to hand in
    return transitionToSubmitted(parsed.data.id, existing, user.id);
  }

  // Everything left is a move between the two open columns, or back out of
  // `done`. `completed_at` is the only record of *when* a task was finished
  // — the monthly archive groups by it and the weekly bot scores on-time vs
  // late against it — so leaving `done` clears it, and a re-completion gets
  // stamped afresh by finalizeTaskDone.
  try {
    await sql`
      update tasks set
        status = ${parsed.data.status},
        completed_at = null,
        updated_at = now()
      where id = ${parsed.data.id}
    `;
  } catch (error) {
    console.error('updateTaskStatusAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  await bumpBoardSignal('tasks');

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

// ==========================================================================
// The approval workflow
// ==========================================================================

const taskIdSchema = z.object({ id: z.string().uuid() });

/**
 * Assignee hands the task in for review (the explicit button; dragging into
 * the done column goes through updateTaskStatusAction and lands in exactly
 * the same place). `pending` counts as a valid source — a task can be
 * finished without ever being dragged through `in_progress`.
 */
export async function submitTaskAction(formData: FormData): Promise<UpdateTaskStatusResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = taskIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [existing] = await selectLifecycleRow(parsed.data.id);
  // Only the assignee reports their own progress — mirrors
  // updateTaskStatusAction's check, and the DB-level trigger that used to
  // enforce it no longer exists.
  if (!existing || existing.assigned_to !== user.id) return { error: 'forbidden' };
  if (isTaskUnderReview(existing.status)) return { error: 'underReview' };
  if (!(TASK_OPEN_STATUSES as readonly string[]).includes(existing.status)) {
    return { error: 'invalidTransition' };
  }

  return transitionToSubmitted(parsed.data.id, existing, user.id);
}

/**
 * Loads the task for a CEO review decision, re-checking the role and the
 * "you assigned it" ownership rule that updateTaskAction / deleteTaskAction
 * already use — a page guard is not enough for a Server Action.
 */
async function loadForReview(
  taskId: string,
): Promise<{ error: string } | { actingUserId: string; existing: TaskLifecycleRow }> {
  let actingUserId: string;
  try {
    const { user } = await requireTaskAssigner();
    actingUserId = user.id;
  } catch {
    return { error: 'forbidden' };
  }

  const [existing] = await selectLifecycleRow(taskId);
  if (!existing || existing.assigned_by !== actingUserId) return { error: 'forbidden' };
  if (existing.status !== 'submitted') return { error: 'notUnderReview' };

  return { actingUserId, existing };
}

/**
 * CEO approves. Two landings:
 *   - `requires_proof` set  → `awaiting_upload`; stars stay unsettled until
 *     the assignee attaches their file (uploadTaskProofAction).
 *   - otherwise             → `done`, and stars settle right here.
 *
 * Timing note: the on-time/late decision uses the instant *approval* stamps
 * `completed_at`, not when the assignee submitted. An approve that lands
 * after the deadline is still late, exactly as the spec asks.
 */
export async function approveTaskAction(formData: FormData): Promise<UpdateTaskStatusResult> {
  const parsed = taskIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const loaded = await loadForReview(parsed.data.id);
  if ('error' in loaded) return { error: loaded.error };
  const { actingUserId, existing } = loaded;

  try {
    await sql`
      update tasks set
        status = ${existing.requires_proof ? 'awaiting_upload' : 'in_progress'},
        reviewed_by = ${actingUserId},
        reviewed_at = now(),
        rejection_reason = null,
        updated_at = now()
      where id = ${parsed.data.id} and status = 'submitted'
    `;
  } catch (error) {
    console.error('approveTaskAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  // The write above parks a no-proof task at `in_progress` for a fraction of
  // a second rather than writing `done` directly, so that `finalizeTaskDone`
  // stays the single place `completed_at` is ever stamped and stars are ever
  // settled. Its own guarded UPDATE is what keeps that idempotent.
  if (!existing.requires_proof) {
    const result = await finalizeTaskDone(parsed.data.id, existing);
    if (result.error) return result;
  }

  await bumpBoardSignal('tasks');
  await bumpNavBadgeSignal(existing.assigned_to);

  const assigneeTelegramId = await telegramIdFor(existing.assigned_to);
  await notifyTelegram(
    assigneeTelegramId,
    existing.requires_proof
      ? `✅ "${escapeTelegramText(existing.title)}" vazifangiz tasdiqlandi.\nEndi tasdiqlovchi faylni yuklashingiz kerak.`
      : `✅ "${escapeTelegramText(existing.title)}" vazifangiz tasdiqlandi va yakunlandi.`,
  );

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

const rejectSchema = z.object({
  id: z.string().uuid(),
  // Mandatory, and long enough to actually say something — "no" is not a
  // review. The client enforces the same minimum, this is the boundary.
  reason: z
    .string()
    .trim()
    .min(TASK_REJECTION_REASON_MIN_LENGTH)
    .max(TASK_REJECTION_REASON_MAX_LENGTH),
});

export type RejectTaskState = { error?: string } | undefined;

/**
 * CEO rejects. The task goes back to `in_progress` carrying the written
 * reason, and — this is the "reject = auto-deduct the minus star" rule — the
 * `star_penalty` the CEO attached when creating the task is charged *now*,
 * rather than waiting for a late completion that may never come.
 *
 * The charge reuses the same guarded `star_penalty_applied_at is null`
 * UPDATE as every other path (settleTaskStars, the overdue cron), so a task
 * rejected twice, or rejected and later completed late, is only ever fined
 * once.
 */
export async function rejectTaskAction(
  _prevState: RejectTaskState,
  formData: FormData,
): Promise<RejectTaskState> {
  const parsed = rejectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'reasonRequired' };

  const loaded = await loadForReview(parsed.data.id);
  if ('error' in loaded) return { error: loaded.error };
  const { actingUserId, existing } = loaded;

  try {
    await sql`
      update tasks set
        status = 'in_progress',
        rejection_reason = ${parsed.data.reason},
        reviewed_by = ${actingUserId},
        reviewed_at = now(),
        submitted_at = null,
        completed_at = null,
        updated_at = now()
      where id = ${parsed.data.id} and status = 'submitted'
    `;
  } catch (error) {
    console.error('rejectTaskAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  // Fine first, message second — the assignee's Telegram should be able to
  // quote the number, and a failed send must not roll the fine back.
  let charged = 0;
  try {
    const [applied] = await sql<{ star_penalty: number }[]>`
      update tasks set star_penalty_applied_at = now()
      where id = ${parsed.data.id} and star_penalty > 0 and star_penalty_applied_at is null
      returning star_penalty
    `;
    if (applied) {
      await insertStarTransaction(sql, {
        userId: existing.assigned_to,
        // Positive magnitude in the column, sign applied at ledger-write
        // time — identical shape to the late-completion and cron paths, with
        // its own reason so the three are told apart in the ledger.
        delta: -applied.star_penalty,
        reason: 'Vazifa rad etildi',
        sourceType: 'task',
        sourceId: parsed.data.id,
        createdBy: actingUserId,
      });
      charged = applied.star_penalty;
    }
  } catch (error) {
    // The rejection already committed — a stars hiccup must not turn a
    // successful review into an error for the CEO.
    console.error('reject penalty failed', error instanceof Error ? error.message : error);
  }

  await bumpBoardSignal('tasks');
  await bumpNavBadgeSignal(existing.assigned_to);

  const assigneeTelegramId = await telegramIdFor(existing.assigned_to);
  await notifyTelegram(
    assigneeTelegramId,
    `❌ "${escapeTelegramText(existing.title)}" vazifangiz qaytarildi.\nSabab: ${escapeTelegramText(parsed.data.reason)}` +
      (charged > 0 ? `\nSizdan ${charged} yulduz yechildi.` : ''),
  );

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

// --------------------------------------------------------------------------
// Proof upload (awaiting_upload → done)
// --------------------------------------------------------------------------

const proofUploadUrlSchema = z.object({
  taskId: z.string().uuid(),
  fileName: z.string().trim().min(1),
  fileType: z.string().trim().min(1).max(200),
});

export type TaskUploadUrlResult = { path?: string; url?: string; error?: string };

/**
 * Signed one-shot PUT URL for the assignee's proof file, so the browser
 * uploads straight to Cloud Storage and never through this server (Next's
 * 1MB Server Action body limit would reject anything real). Mirrors
 * requestChatMediaUploadUrlAction / requestIssueVoiceUploadUrlAction.
 *
 * The object path — never a signed URL — is what gets persisted; reads are
 * re-signed on demand. The path is namespaced by task *and* uploader so
 * uploadTaskProofAction can re-derive and verify it instead of trusting
 * whatever the client posts back.
 */
export async function requestTaskProofUploadUrlAction(
  taskId: string,
  fileName: string,
  fileType: string,
): Promise<TaskUploadUrlResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = proofUploadUrlSchema.safeParse({ taskId, fileName, fileType });
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    const [existing] = await selectLifecycleRow(parsed.data.taskId);
    if (!existing || existing.assigned_to !== user.id) return { error: 'forbidden' };
    if (existing.status !== 'awaiting_upload') return { error: 'invalidTransition' };

    const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
    const path = `${TASK_ATTACHMENT_PREFIX}/${parsed.data.taskId}/${user.id}/${crypto.randomUUID()}-${sanitized}`;
    const url = await createSignedWriteUrl('chat_media', path, parsed.data.fileType);
    return { path, url };
  } catch (error) {
    console.error(
      'requestTaskProofUploadUrlAction failed',
      error instanceof Error ? error.message : error,
    );
    return { error: 'uploadFailed' };
  }
}

const proofSchema = z.object({
  id: z.string().uuid(),
  objectPath: z.string().trim().min(1).max(500),
  fileName: z.string().trim().max(300).optional().or(z.literal('')),
  mimeType: z.string().trim().max(200).optional().or(z.literal('')),
});

/**
 * The assignee's proof landed in the bucket — record it and finish the task.
 * This is the second of the two paths into `done`; stars settle here exactly
 * as they do on a straight approval, against the instant `completed_at` is
 * stamped.
 */
export async function uploadTaskProofAction(formData: FormData): Promise<UpdateTaskStatusResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = proofSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [existing] = await selectLifecycleRow(parsed.data.id);
  if (!existing || existing.assigned_to !== user.id) return { error: 'forbidden' };
  if (existing.status !== 'awaiting_upload') return { error: 'invalidTransition' };

  // Defense in depth: the signed URL above already scoped the object to this
  // task and this uploader, but never trust a client-supplied path outright
  // (mirrors createIssueAction's voiceUrl prefix re-check).
  const expectedPrefix = `${TASK_ATTACHMENT_PREFIX}/${parsed.data.id}/${user.id}/`;
  if (!parsed.data.objectPath.startsWith(expectedPrefix)) return { error: 'forbidden' };

  const mimeType = parsed.data.mimeType || 'application/octet-stream';
  try {
    await sql`
      insert into task_attachments (task_id, uploader_id, kind, is_proof, object_path, file_name, mime_type)
      values (${parsed.data.id}, ${user.id}, ${taskAttachmentKindForMime(mimeType)}, true,
              ${parsed.data.objectPath}, ${parsed.data.fileName || null}, ${mimeType})
    `;
  } catch (error) {
    console.error('uploadTaskProofAction failed', error instanceof Error ? error.message : error);
    return { error: 'uploadFailed' };
  }

  const result = await finalizeTaskDone(parsed.data.id, existing);
  if (result.error) return result;

  await bumpBoardSignal('tasks');
  await bumpNavBadgeSignal(existing.assigned_by);

  const [ceoTelegramId, actorName] = await Promise.all([
    telegramIdFor(existing.assigned_by),
    displayNameFor(user.id),
  ]);
  await notifyTelegram(
    ceoTelegramId,
    `📎 <b>${escapeTelegramText(actorName)}</b> "${escapeTelegramText(existing.title)}" vazifasi uchun faylni yukladi. Vazifa yakunlandi.`,
  );

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
  status: TaskStatus;
  completed_at: string | null;
  /** Derived in the query rather than from a render-time `Date.now()` — a
   * clock read during render is impure (react-hooks/purity) and the DB is
   * the one clock both the board and the archive already agree on.
   *
   * Deliberately false while the task is `submitted` / `awaiting_upload`:
   * the work is in, the clock is the reviewer's now, and nothing is charged
   * for the wait (same rule the overdue-penalty cron follows). */
  is_overdue: boolean;
  updated_at: string;
  comment_count: number;
  /** Files/audio hanging off this task — count only; the drawer loads them. */
  attachment_count: number;
  /** The CEO ticked "the employee must upload a file": approval routes the
   * task through `awaiting_upload` instead of straight to `done`. */
  requires_proof: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
  /** The CEO's mandatory explanation, shown to the assignee on the card
   * until they resubmit. */
  rejection_reason: string | null;
  star_reward?: number;
  /** Positive magnitude of the fine deducted when this task is completed
   * after its deadline; 0 = none. */
  star_penalty?: number;
  /** Manual board position within the card's own status column, ascending.
   * Every row starts at 0 (see 20260906120100_add_tasks_sort_order.sql), so
   * `created_at desc` remains the effective tie-break until a column is
   * actually reordered — see reorderTaskAction. */
  sort_order: number;
};

/**
 * Start of the current Asia/Tashkent calendar month, as a timestamptz. The
 * whole staff is in Tashkent and Cloud Run's clock is UTC, so the month
 * boundary must be computed in that zone — `date_trunc('month', now())`
 * alone would roll the board over five hours late.
 */
const currentMonthStart = () =>
  sql`date_trunc('month', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent'`;

/**
 * Re-fetch for TaskBoard's live refresh, triggered whenever
 * board_signals/tasks changes in Firestore (see lib/gcp/firestoreAdmin.ts's
 * bumpBoardSignal) — Firestore only carries an empty "something changed"
 * signal, no row payload, so the client re-derives the whole visible list
 * from here rather than trying to patch one row in place. tasks/page.tsx
 * calls this same action for its own initial render, so there is exactly
 * one definition of "visible": only the task's creator or assignee may see
 * it, and a done task drops off the board once its month is over — it lives
 * on in the monthly archive below the board
 * (getMonthlyTaskArchiveAction), never deleted.
 *
 * The old window was `updated_at >= sevenDaysAgo`, which was doubly wrong:
 * `updated_at` was never written after insert (AUD-20), so it really meant
 * "created in the last 7 days", and a rolling 7-day window cuts the month
 * the archive is keyed on in half.
 */
export async function getVisibleTasksAction(): Promise<VisibleTaskRow[]> {
  const { user } = await getAuthState();
  if (!user) return [];

  return sql<VisibleTaskRow[]>`
    select id, title, description, assigned_to, assigned_by, deadline, status, completed_at, updated_at,
           (status in ${sql([...TASK_OPEN_STATUSES])} and deadline < now()) as is_overdue,
           (select count(*) from task_comments c where c.task_id = tasks.id)::int as comment_count,
           (select count(*) from task_attachments a where a.task_id = tasks.id)::int as attachment_count,
           requires_proof, submitted_at, reviewed_at, rejection_reason,
           star_reward, star_penalty, sort_order
    from tasks
    where (assigned_by = ${user.id} or assigned_to = ${user.id})
      and (status <> 'done' or completed_at >= ${currentMonthStart()})
    order by sort_order asc, created_at desc
  `;
}

const reorderSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(['up', 'down']),
});

export type ReorderTaskResult = { error?: string };

/**
 * Move a card one position up or down inside its own status column
 * (TaskCard's ▲/▼ buttons). Deliberately separate from the drag-and-drop
 * status change: dragging moves a card *between* columns
 * (updateTaskStatusAction), this reorders *within* one.
 *
 * Scope: the sibling list is exactly what getVisibleTasksAction would return
 * for this caller, narrowed to the target's status — same
 * creator-or-assignee visibility and the same "done drops off once its month
 * is over" window — so the server can never reorder a row the caller cannot
 * see, and the client's optimistic swap over its own column is looking at
 * the identical list.
 *
 * Why renumber instead of swapping two values: every pre-existing row sits
 * at the `0` default, and swapping 0 with 0 is a no-op that would make the
 * very first click on any column do nothing. Assigning each sibling its
 * current visible index (with the two entries exchanged) is well-defined
 * from that all-zero start state, and degenerates to a plain swap once a
 * column has been numbered.
 */
export async function reorderTaskAction(formData: FormData): Promise<ReorderTaskResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = reorderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [target] = await sql<{ assigned_to: string; assigned_by: string; status: string }[]>`
    select assigned_to, assigned_by, status from tasks where id = ${parsed.data.id}
  `;
  // Same rule the board's own visibility uses — a task you can't see is
  // indistinguishable from one that doesn't exist.
  if (!target || (target.assigned_by !== user.id && target.assigned_to !== user.id)) {
    return { error: 'forbidden' };
  }

  let siblings: { id: string }[];
  try {
    siblings = await sql<{ id: string }[]>`
      select id
      from tasks
      where (assigned_by = ${user.id} or assigned_to = ${user.id})
        and status = ${target.status}
        and (status <> 'done' or completed_at >= ${currentMonthStart()})
      order by sort_order asc, created_at desc
    `;
  } catch (error) {
    console.error('reorderTaskAction read failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  const index = siblings.findIndex((row) => row.id === parsed.data.id);
  // Off the board entirely (a done task from a previous month) — nothing to
  // reorder, but not an error worth toasting at the viewer.
  if (index === -1) return {};

  const neighbour = parsed.data.direction === 'up' ? index - 1 : index + 1;
  // Already at the top/bottom of its column: successful no-op.
  if (neighbour < 0 || neighbour >= siblings.length) return {};

  const ids = siblings.map((row) => row.id);
  [ids[index], ids[neighbour]] = [ids[neighbour], ids[index]];
  const orders = ids.map((_, position) => position);

  try {
    await sql`
      update tasks as t
      set sort_order = v.ord
      from (select * from unnest(${ids}::uuid[], ${orders}::int[]) as x(id, ord)) as v
      where t.id = v.id and t.sort_order is distinct from v.ord
    `;
  } catch (error) {
    console.error('reorderTaskAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  await bumpBoardSignal('tasks');

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

export type ArchivedTaskRow = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  deadline: string;
  status: string;
  completed_at: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
};

export type MonthlyTaskArchiveEntry = {
  /** 'YYYY-MM', Asia/Tashkent */
  monthKey: string;
  /** Month name localized to the caller's locale, e.g. "Avgust 2026". */
  label: string;
  stats: EfficiencyStats;
  /** Every task the caller can see that was completed in this month. */
  tasks: ArchivedTaskRow[];
};

type ArchiveQueryRow = ArchivedTaskRow & { completed_month: string | null };

/** Drops the grouping-only column before the row crosses to the client. */
function stripCompletedMonth(row: ArchiveQueryRow): ArchivedTaskRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assigned_to: row.assigned_to,
    deadline: row.deadline,
    status: row.status,
    completed_at: row.completed_at,
    assignee_first_name: row.assignee_first_name,
    assignee_last_name: row.assignee_last_name,
  };
}

/**
 * The past-months archive rendered under the board (spec #5). Same
 * creator-or-assignee scoping as getVisibleTasksAction; one entry per past
 * Tashkent month that has at least one completed task, newest first.
 *
 * The efficiency stats deliberately score a *wider* set than the listed
 * tasks: `efficiencyForMonth` counts everything that was **due** in the
 * month (a task due in March but never finished belongs in March's "not
 * done" tally even though it has no completed_at at all), while the listed
 * tasks are the ones actually **completed** in it. Hence the query pulls
 * both and hands the whole set to efficiencyForMonth, which re-applies its
 * own deadline window per month.
 *
 * Ordering stays `completed_at desc` on purpose: `sort_order` is a *live
 * board* position inside one status column, and reordering today's pending
 * column must not shuffle a finished month's history. The archive is a
 * chronological record, so it keeps ordering by when work was completed.
 */
export async function getMonthlyTaskArchiveAction(): Promise<MonthlyTaskArchiveEntry[]> {
  const { user } = await getAuthState();
  if (!user) return [];

  let rows: ArchiveQueryRow[];
  try {
    rows = await sql<ArchiveQueryRow[]>`
      select
        t.id,
        t.title,
        t.description,
        t.assigned_to,
        t.deadline,
        t.status,
        t.completed_at,
        p.first_name as assignee_first_name,
        p.last_name  as assignee_last_name,
        to_char(t.completed_at at time zone 'Asia/Tashkent', 'YYYY-MM') as completed_month
      from tasks t
      left join profiles p on p.id = t.assigned_to
      where (t.assigned_by = ${user.id} or t.assigned_to = ${user.id})
        and (t.completed_at < ${currentMonthStart()} or t.deadline < ${currentMonthStart()})
      order by t.completed_at desc nulls last, t.deadline desc
    `;
  } catch (error) {
    console.error(
      'getMonthlyTaskArchiveAction failed',
      error instanceof Error ? error.message : error,
    );
    return [];
  }

  const monthKeys = [
    ...new Set(
      rows
        .filter((row) => row.status === 'done' && row.completed_month)
        .map((row) => row.completed_month as string),
    ),
  ].sort((a, b) => b.localeCompare(a));

  const format = await getFormatter();

  return monthKeys.map((monthKey) => ({
    monthKey,
    // Parsed and formatted as UTC on purpose: the key is already a Tashkent
    // month, so re-applying a zone here could name the neighbouring month.
    label: format.dateTime(new Date(`${monthKey}-01T00:00:00Z`), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    stats: efficiencyForMonth(rows, monthKey),
    tasks: rows
      .filter((row) => row.status === 'done' && row.completed_month === monthKey)
      .map(stripCompletedMonth),
  }));
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

  try {
    await sql`delete from tasks where id = ${parsed.data.id}`;
  } catch (error) {
    console.error('deleteTaskAction failed', error instanceof Error ? error.message : error);
    return { error: 'deleteFailed' };
  }

  await bumpBoardSignal('tasks');

  revalidatePath('/[locale]/tasks', 'page');
  return {};
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
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
  // Optional star bounty the CEO attaches to a task; paid out to the
  // assignee once, the first time the task reaches `done` (see
  // updateTaskStatusAction). No upper bound — stars are deliberately
  // uncapped. 0 / omitted = no reward.
  starReward: z.coerce.number().int().min(0).optional(),
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
    insert into tasks (title, description, assigned_to, assigned_by, deadline, star_reward)
    values (${parsed.data.title}, ${parsed.data.description || null}, ${parsed.data.assignedTo}, ${actingUserId}, ${parsed.data.deadline}, ${parsed.data.starReward ?? 0})
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
        updated_at = now()
        -- Only adjustable while the bounty hasn't been paid out yet.
        ${parsed.data.starReward !== undefined ? sql`, star_reward = case when star_awarded_at is null then ${parsed.data.starReward} else star_reward end` : sql``}
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

  const [existing] = await sql<{ assigned_to: string; assigned_by: string; status: string }[]>`
    select assigned_to, assigned_by, status from tasks where id = ${parsed.data.id}
  `;
  if (!existing || existing.assigned_to !== user.id) return { error: 'forbidden' };

  // `completed_at` is the only record of *when* a task was finished — the
  // monthly archive groups by it and the weekly bot scores on-time vs late
  // against it, so it must be stamped exactly once, here. Re-saving a task
  // that is already done keeps the original completion instant (otherwise a
  // no-op drag would silently carry a task into a later month); moving back
  // out of `done` clears it, so a re-completion is stamped afresh.
  const completedAt =
    parsed.data.status === 'done'
      ? existing.status === 'done'
        ? sql`completed_at`
        : sql`now()`
      : sql`null`;

  try {
    await sql`
      update tasks set
        status = ${parsed.data.status},
        completed_at = ${completedAt},
        updated_at = now()
      where id = ${parsed.data.id}
    `;
  } catch (error) {
    console.error('updateTaskStatusAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  // Star bounty payout — only on the first transition into `done`, and only
  // once. The `star_awarded_at is null` guard in the WHERE makes "award
  // once" atomic even under a double-click / retry: at most one caller gets
  // a row back and therefore writes the ledger entry.
  if (parsed.data.status === 'done' && existing.status !== 'done') {
    try {
      const [awarded] = await sql<{ star_reward: number }[]>`
        update tasks set star_awarded_at = now()
        where id = ${parsed.data.id} and star_reward > 0 and star_awarded_at is null
        returning star_reward
      `;
      if (awarded) {
        await insertStarTransaction(sql, {
          userId: existing.assigned_to,
          delta: awarded.star_reward,
          reason: 'Vazifa bajarildi',
          sourceType: 'task',
          sourceId: parsed.data.id,
          createdBy: existing.assigned_by,
        });
        await bumpNavBadgeSignal(existing.assigned_to);
      }
    } catch (error) {
      // The status change already committed — a stars hiccup must not turn
      // a successful "mark done" into an error for the assignee.
      console.error('task star payout failed', error instanceof Error ? error.message : error);
    }
  }

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
  completed_at: string | null;
  /** Derived in the query rather than from a render-time `Date.now()` — a
   * clock read during render is impure (react-hooks/purity) and the DB is
   * the one clock both the board and the archive already agree on. */
  is_overdue: boolean;
  updated_at: string;
  comment_count: number;
  star_reward?: number;
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
           (status <> 'done' and deadline < now()) as is_overdue,
           (select count(*) from task_comments c where c.task_id = tasks.id)::int as comment_count,
           star_reward, sort_order
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

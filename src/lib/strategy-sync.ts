import 'server-only';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { bumpBoardSignal, bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';
import type { StrategyTask, TaskStatus } from '@/lib/strategy';

/**
 * Strategy → Tasks mirror. A strategy task with an assignee owns exactly one
 * `tasks` row (tasks.strategy_task_id), so the assignee works it from their
 * own Tasks board. The other direction (assignee drags / submits / gets
 * approved) is the `tasks_sync_strategy` trigger in the migration
 * 20261004120000_strategy_task_mirror.sql.
 *
 * Status, Strategy → Tasks: the strategy side is where the plan owner
 * decides, so "done" there approves the mirror (Project managers can't
 * review on the Tasks board) and moving it back reopens it.
 *
 * Best-effort by design: a failure here is logged and never fails the
 * strategy save that already committed.
 */

const TO_TASKS: Record<TaskStatus, string> = {
  todo: 'pending',
  progress: 'in_progress',
  review: 'submitted',
  done: 'done',
};

type Mirror = { id: string; assigned_to: string; status: string };

/** End of the business day in Tashkent, as the mirror's deadline. */
const deadlineOf = (endDate: string) => sql`(${endDate}::date + time '18:00') at time zone 'Asia/Tashkent'`;

async function notifyAssigned(assigneeId: string, task: StrategyTask) {
  try {
    const [p] = await sql<{ telegram_id: number | null }[]>`select telegram_id from profiles where id = ${assigneeId}`;
    if (!p?.telegram_id) return;
    const [d, m, y] = [task.end_date.slice(8, 10), task.end_date.slice(5, 7), task.end_date.slice(0, 4)];
    await sendTelegramMessage(
      p.telegram_id,
      `🎯 Sizga strategiya vazifasi biriktirildi: <b>${escapeTelegramText(task.title)}</b>\nMuddati: ${d}.${m}.${y}\nVazifalar bo‘limida ko‘rishingiz mumkin.`,
    );
  } catch (error) {
    console.error('strategy mirror notify failed', error instanceof Error ? error.message : error);
  }
}

/** Create / update / remove the mirror so it matches the strategy task. */
export async function syncStrategyMirror(task: StrategyTask, actorId: string): Promise<void> {
  try {
    const [mirror] = await sql<Mirror[]>`
      select id, assigned_to, status from tasks where strategy_task_id = ${task.id}`;

    // No assignee: an open mirror goes away; a finished one stays as history.
    if (!task.assignee_id) {
      if (mirror && mirror.status !== 'done') {
        await sql`delete from tasks where id = ${mirror.id}`;
        await bumpBoardSignal('tasks');
        await bumpNavBadgeSignal(mirror.assigned_to);
      }
      return;
    }

    const status = TO_TASKS[task.status];
    if (!mirror) {
      await sql`
        insert into tasks (title, description, assigned_to, assigned_by, deadline, status, strategy_task_id,
                           completed_at, reviewed_by, reviewed_at)
        values (${task.title}, ${task.description || null}, ${task.assignee_id}, ${actorId}, ${deadlineOf(task.end_date)},
                ${status}, ${task.id},
                ${status === 'done' ? sql`now()` : null}, ${status === 'done' ? actorId : null},
                ${status === 'done' ? sql`now()` : null})
        on conflict do nothing`;
      await notifyAssigned(task.assignee_id, task);
    } else {
      const reassigned = mirror.assigned_to !== task.assignee_id;
      await sql`
        update tasks set
          title = ${task.title},
          description = ${task.description || null},
          assigned_to = ${task.assignee_id},
          deadline = ${deadlineOf(task.end_date)},
          status = ${status},
          completed_at = case when ${status} = 'done' then coalesce(completed_at, now()) else null end,
          reviewed_by = case when ${status} = 'done' and status <> 'done' then ${actorId}::uuid else reviewed_by end,
          reviewed_at = case when ${status} = 'done' and status <> 'done' then now() else reviewed_at end,
          updated_at = now()
        where id = ${mirror.id}`;
      if (reassigned) {
        await bumpNavBadgeSignal(mirror.assigned_to);
        await notifyAssigned(task.assignee_id, task);
      }
    }
    await bumpBoardSignal('tasks');
    await bumpNavBadgeSignal(task.assignee_id);
  } catch (error) {
    console.error('syncStrategyMirror failed', error instanceof Error ? error.message : error);
  }
}

/** Before a strategy task is deleted: drop its open mirror (done ones stay). */
export async function dropStrategyMirror(strategyTaskId: string): Promise<void> {
  try {
    const rows = await sql<{ assigned_to: string }[]>`
      delete from tasks where strategy_task_id = ${strategyTaskId} and status <> 'done' returning assigned_to`;
    if (rows.length) {
      await bumpBoardSignal('tasks');
      await bumpNavBadgeSignal(rows[0].assigned_to);
    }
  } catch (error) {
    console.error('dropStrategyMirror failed', error instanceof Error ? error.message : error);
  }
}

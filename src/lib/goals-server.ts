import 'server-only';
import { sql } from '@/lib/db/client';
import { nextPeriodKey, shiftDue, type GoalItem, type GoalScope } from '@/lib/goals';

// Shared by the dashboard actions and the bot's «➡️ Ertaga» button, so both
// move a goal exactly the same way.

/** A goals row as selected by:
 *   id, scope, title, done, priority, carry_count, moved_from, due_time,
 *   to_char(due_date, 'YYYY-MM-DD') as due_date,
 *   to_char(done_at at time zone 'Asia/Tashkent', 'HH24:MI') as done_at */
export type GoalRow = {
  id: string;
  scope: GoalScope;
  title: string;
  done: boolean;
  priority: boolean;
  carry_count: number;
  moved_from: string | null;
  due_time: string | null;
  due_date: string | null;
  done_at: string | null;
};

export function toGoalItem(r: GoalRow): GoalItem {
  return {
    id: r.id,
    scope: r.scope,
    title: r.title,
    done: r.done,
    doneAt: r.done ? r.done_at : null,
    dueDate: r.due_date,
    dueTime: r.due_time,
    priority: r.priority,
    carry: r.carry_count,
    movedFrom: r.moved_from,
  };
}

/**
 * Moves an open goal to the next period ('next'), or back to where a manual
 * move took it from ('back' — the undo). The deadline moves with it.
 * Returns the new period key, or null when nothing matched.
 */
export async function moveGoal(userId: string, id: string, dir: 'next' | 'back'): Promise<string | null> {
  const [g] = await sql<{ scope: GoalScope; period_key: string; due_date: string | null; moved_from: string | null }[]>`
    select scope, period_key, to_char(due_date, 'YYYY-MM-DD') as due_date, moved_from
    from goals where id = ${id} and user_id = ${userId} and not done`;
  if (!g) return null;
  if (dir === 'back' && !g.moved_from) return null;
  const to = dir === 'next' ? nextPeriodKey(g.scope, g.period_key) : g.moved_from!;
  const due = shiftDue(g.scope, g.due_date, g.period_key, to);
  const res = await sql`
    update goals set
      period_key = ${to},
      due_date = ${due},
      reminded_at = null,
      carry_count = greatest(0, carry_count + ${dir === 'next' ? 1 : -1}),
      moved_from = ${dir === 'next' ? g.period_key : null}
    where id = ${id} and user_id = ${userId} and not done and period_key = ${g.period_key}`;
  return res.count ? to : null;
}

export async function setGoalDone(userId: string, id: string, done: boolean): Promise<boolean> {
  const res = await sql`
    update goals set done = ${done}, done_at = case when ${done} then coalesce(done_at, now()) else null end
    where id = ${id} and user_id = ${userId}`;
  return res.count > 0;
}

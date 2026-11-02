'use server';

import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { moveGoal, setGoalDone } from '@/lib/goals-server';

// Shaxsiy maqsadlar (kun/hafta/oy). Har amal auth qayta tekshiradi va faqat
// o'z yozuviga tegadi.
export type GoalResult = { error: string } | { ok: true; id?: string; periodKey?: string };
export type GoalOptions = { dueDate?: string | null; dueTime?: string | null; priority?: boolean };
const SCOPES = ['day', 'week', 'month'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function revalidate() {
  revalidatePath('/[locale]/dashboard', 'page');
  revalidatePath('/[locale]/task-tracker', 'page');
}

export async function addGoalAction(scope: string, periodKey: string, title: string, opts: GoalOptions = {}): Promise<GoalResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!SCOPES.includes(scope)) return { error: 'scope' };
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(periodKey)) return { error: 'period' };
  const t = (title ?? '').trim();
  if (!t) return { error: 'empty' };
  if (t.length > 160) return { error: 'tooLong' };
  // A daily goal's deadline is always its own day; only the hour is chosen.
  const dueTime = opts.dueTime && TIME.test(opts.dueTime) ? opts.dueTime : null;
  const dueDate = scope === 'day' ? (dueTime ? periodKey : null) : opts.dueDate && DATE.test(opts.dueDate) ? opts.dueDate : null;
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into goals (user_id, scope, period_key, title, due_date, due_time, priority)
      values (${user.id}, ${scope}, ${periodKey}, ${t}, ${dueDate}, ${scope === 'day' ? dueTime : null}, ${!!opts.priority})
      returning id`;
    revalidate();
    return { ok: true, id: row.id };
  } catch (e) {
    console.error('[goals] add failed', e);
    return { error: 'failed' };
  }
}

export async function toggleGoalAction(id: string, done: boolean): Promise<GoalResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!id) return { error: 'empty' };
  try {
    if (!(await setGoalDone(user.id, id, !!done))) return { error: 'notFound' };
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[goals] toggle failed', e);
    return { error: 'failed' };
  }
}

/** «→ Ertaga» ('next') and its «Qaytarish» ('back'). */
export async function moveGoalAction(id: string, dir: 'next' | 'back'): Promise<GoalResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!id || (dir !== 'next' && dir !== 'back')) return { error: 'empty' };
  try {
    const to = await moveGoal(user.id, id, dir);
    if (!to) return { error: 'notFound' };
    revalidate();
    return { ok: true, periodKey: to };
  } catch (e) {
    console.error('[goals] move failed', e);
    return { error: 'failed' };
  }
}

export async function deleteGoalAction(id: string): Promise<GoalResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!id) return { error: 'empty' };
  try {
    const res = await sql`delete from goals where id = ${id} and user_id = ${user.id}`;
    if (res.count === 0) return { error: 'notFound' };
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[goals] delete failed', e);
    return { error: 'failed' };
  }
}

/**
 * Tahrirlash: new text, and optionally another period (kunlik → haftalik…).
 * Moving a goal puts it in the current period of the new scope; its old
 * deadline belonged to the old period, so it is cleared.
 */
export async function editGoalAction(id: string, title: string, scope?: string, periodKey?: string): Promise<GoalResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!id) return { error: 'empty' };
  const t = (title ?? '').trim();
  if (!t) return { error: 'empty' };
  if (t.length > 160) return { error: 'tooLong' };
  if (scope !== undefined && (!SCOPES.includes(scope) || !periodKey || !/^\d{4}-\d{2}(-\d{2})?$/.test(periodKey))) return { error: 'scope' };
  try {
    const res = scope
      ? await sql`update goals set title = ${t}, scope = ${scope}, period_key = ${periodKey!}, due_date = null, due_time = null, moved_from = null, reminded_at = null where id = ${id} and user_id = ${user.id}`
      : await sql`update goals set title = ${t} where id = ${id} and user_id = ${user.id}`;
    if (res.count === 0) return { error: 'notFound' };
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[goals] edit failed', e);
    return { error: 'failed' };
  }
}

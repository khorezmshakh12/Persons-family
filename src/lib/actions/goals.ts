'use server';

import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';

// Shaxsiy maqsadlar (kun/hafta/oy). Har amal auth qayta tekshiradi va faqat
// o'z yozuviga tegadi.
export type GoalResult = { error: string } | { ok: true; id?: string };
const SCOPES = ['day', 'week', 'month'];

export async function addGoalAction(scope: string, periodKey: string, title: string): Promise<GoalResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!SCOPES.includes(scope)) return { error: 'scope' };
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(periodKey)) return { error: 'period' };
  const t = (title ?? '').trim();
  if (!t) return { error: 'empty' };
  if (t.length > 160) return { error: 'tooLong' };
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into goals (user_id, scope, period_key, title) values (${user.id}, ${scope}, ${periodKey}, ${t}) returning id`;
    revalidatePath('/[locale]/dashboard', 'page');
    revalidatePath('/[locale]/task-tracker', 'page');
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
    const res = await sql`update goals set done = ${!!done}, done_at = case when ${!!done} then coalesce(done_at, now()) else null end where id = ${id} and user_id = ${user.id}`;
    if (res.count === 0) return { error: 'notFound' };
    revalidatePath('/[locale]/dashboard', 'page');
    revalidatePath('/[locale]/task-tracker', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[goals] toggle failed', e);
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
    revalidatePath('/[locale]/dashboard', 'page');
    revalidatePath('/[locale]/task-tracker', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[goals] delete failed', e);
    return { error: 'failed' };
  }
}

/**
 * Tahrirlash: new text, and optionally another period (kunlik → haftalik…).
 * Moving a goal puts it in the current period of the new scope.
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
      ? await sql`update goals set title = ${t}, scope = ${scope}, period_key = ${periodKey!} where id = ${id} and user_id = ${user.id}`
      : await sql`update goals set title = ${t} where id = ${id} and user_id = ${user.id}`;
    if (res.count === 0) return { error: 'notFound' };
    revalidatePath('/[locale]/dashboard', 'page');
    revalidatePath('/[locale]/task-tracker', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[goals] edit failed', e);
    return { error: 'failed' };
  }
}

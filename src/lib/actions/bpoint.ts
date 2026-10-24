'use server';

import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { tashkentYmd } from '@/lib/time';
import { loadPayByMonth } from '@/lib/pay-run-data';

// B-nuqta (yillik maosh maqsadi) ni o'rnatish. O'z B-nuqtasini har kim
// qo'yadi; boshqaniki uchun finance.manage (CEO) kerak.
export async function setBpointAction(input: { staffId?: string; amount: number | string; note?: string }) {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  const staffId = input.staffId || user.id;
  const isSelf = staffId === user.id;
  if (!isSelf && !can(profile.role, 'finance.manage')) return { error: 'forbidden' };
  const amount = Math.max(0, Math.round(Number(input.amount) || 0));
  const year = tashkentYmd().year;
  const note = (input.note ?? '').toString().trim() || null;
  try {
    await sql`
      insert into staff_bpoint (user_id, year, amount, note, updated_by, updated_at)
      values (${staffId}, ${year}, ${amount}, ${note}, ${user.id}, now())
      on conflict (user_id, year) do update set
        amount = excluded.amount, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()`;
    revalidatePath('/[locale]/finance', 'page');
    revalidatePath('/[locale]/finance/[staffId]', 'page');
    revalidatePath('/[locale]/dashboard', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[bpoint] set failed', e);
    return { error: 'failed' };
  }
}

export type BpointSnapshot = { year: number; target: number; earned: number; monthsElapsed: number };

/** One person's B-nuqta progress for the payroll card: this year's target
 * and what they earned so far: each month's computed pay (pay engine),
 * January through this month — the same figure /finance/[staffId] shows.
 * Loaded on demand — one person at a time — to keep the pay run page light. */
export async function getBpointSnapshotAction(staffId: string): Promise<BpointSnapshot | { error: string }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (staffId !== user.id && !can(profile.role, 'finance.viewAll')) return { error: 'forbidden' };
  const { year, month } = tashkentYmd();
  try {
    const [[row], months] = await Promise.all([
      sql<{ amount: number }[]>`select amount from staff_bpoint where user_id = ${staffId} and year = ${year}`,
      loadPayByMonth(`${year}-01-01`, `${year}-${String(month).padStart(2, '0')}-01`, staffId),
    ]);
    const earned = months.reduce((a, m) => a + m.planned, 0);
    return { year, target: row?.amount ?? 0, earned, monthsElapsed: month };
  } catch (e) {
    console.error('[bpoint] snapshot failed', e);
    return { error: 'failed' };
  }
}

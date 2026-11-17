'use server';

import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { tashkentYmd } from '@/lib/time';
import { HORIZONS, isHorizon, type Horizon } from '@/lib/bpoint';
import { loadBpointGoals, type BpointGoalView } from '@/lib/bpoint-data';

// B-nuqta (oylik daromad maqsadi) ni o'rnatish — yarim yil / 1 yil / 3 yil.
// O'z B-nuqtasini har kim qo'yadi; boshqaniki uchun finance.manage (CEO).
// Muddat birinchi saqlangan oydan boshlanadi; summani o'zgartirish muddatni
// qayta boshlamaydi, faqat muddat tugagandan keyingi saqlash yangi muddatni
// shu oydan boshlaydi.
export async function setBpointAction(input: { staffId?: string; horizon: Horizon; amount: number | string; note?: string }) {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!isHorizon(input.horizon)) return { error: 'invalidInput' };
  const staffId = input.staffId || user.id;
  const isSelf = staffId === user.id;
  if (!isSelf && !can(profile.role, 'finance.manage')) return { error: 'forbidden' };
  const amount = Math.max(0, Math.round(Number(input.amount) || 0));
  const note = (input.note ?? '').toString().trim() || null;
  const months = HORIZONS.find((h) => h.key === input.horizon)!.months;
  const { year, month } = tashkentYmd();
  const now = `${year}-${String(month).padStart(2, '0')}-01`;
  try {
    await sql`
      insert into staff_bpoint_goals as g (user_id, horizon, amount, start_period, note, updated_by, updated_at)
      values (${staffId}, ${input.horizon}, ${amount}, ${now}, ${note}, ${user.id}, now())
      on conflict (user_id, horizon) do update set
        amount = excluded.amount, note = excluded.note, updated_by = excluded.updated_by, updated_at = now(),
        start_period = case
          when g.start_period + make_interval(months => ${months}) <= excluded.start_period then excluded.start_period
          else g.start_period end`;
    revalidatePath('/[locale]/finance', 'page');
    revalidatePath('/[locale]/finance/[staffId]', 'page');
    revalidatePath('/[locale]/profile/[id]', 'page');
    revalidatePath('/[locale]/dashboard', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[bpoint] set failed', e);
    return { error: 'failed' };
  }
}

/** One person's three B-nuqta goals for the payroll card — the same view
 * /finance/[staffId] shows. Loaded on demand, one person at a time, to keep
 * the pay run page light. */
export async function getBpointSnapshotAction(staffId: string): Promise<{ goals: BpointGoalView[] } | { error: string }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (staffId !== user.id && !can(profile.role, 'finance.viewAll')) return { error: 'forbidden' };
  try {
    return { goals: await loadBpointGoals(staffId) };
  } catch (e) {
    console.error('[bpoint] snapshot failed', e);
    return { error: 'failed' };
  }
}

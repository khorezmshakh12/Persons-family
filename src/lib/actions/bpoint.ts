'use server';

import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { tashkentYmd } from '@/lib/time';

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
    revalidatePath('/[locale]/finance/[staffId]', 'page');
    revalidatePath('/[locale]/dashboard', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[bpoint] set failed', e);
    return { error: 'failed' };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { ROLES } from '@/lib/permissions';
import { notifyUsers } from '@/lib/telegram';

type Result = { error: string } | { ok: true };

const isCeo = (roles: string[]) => roles.includes('ceo');
const heldRoles = (p: { roles?: string[] | null; role: string }) => p.roles ?? [p.role];

// Xodim o'ziga lavozim so'raydi (CEO dan boshqa). CEO tasdiqlagunча ko'rinmaydi.
export async function requestPositionAction(role: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!(ROLES as readonly string[]).includes(role) || role === 'ceo') return { error: 'invalidRole' };
  if (heldRoles(profile).includes(role)) return { error: 'already' };
  try {
    const rows = await sql`
      insert into position_requests (user_id, role) values (${user.id}, ${role})
      on conflict (user_id, role) where status = 'pending' do nothing returning id`;
    if (rows.count === 0) return { error: 'pending' };
    const ceos = await sql<{ id: string }[]>`
      select distinct p.id from profiles p left join profile_roles r on r.user_id = p.id
      where p.is_active and (p.role = 'ceo' or r.role = 'ceo')`;
    if (ceos.length) {
      await notifyUsers('task', ceos.map((c) => c.id), '🧭 <b>Lavozim so‘rovi</b> — yangi so‘rov tasdiqlashni kutmoqda.', { href: '/hr?tab=roadmap' });
    }
    revalidatePath('/[locale]/hr', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[position-request] request failed', e);
    return { error: 'failed' };
  }
}

async function applyReview(reviewerId: string, id: string, approve: boolean, note: string): Promise<Result> {
  try {
    const [row] = await sql<{ user_id: string; role: string }[]>`
      update position_requests set status = ${approve ? 'approved' : 'rejected'}, reviewed_by = ${reviewerId}, reviewed_at = now(), note = ${note || null}
      where id = ${id} and status = 'pending' returning user_id, role`;
    if (!row) return { error: 'notFound' };
    if (approve) {
      await sql`insert into profile_roles (user_id, role, granted_by) values (${row.user_id}, ${row.role}, ${reviewerId}) on conflict do nothing`;
    }
    await notifyUsers(
      'task',
      [row.user_id],
      approve ? '✅ <b>Lavozim so‘rovingiz tasdiqlandi</b> — yangi lavozim faollashdi.' : `❌ <b>Lavozim so‘rovingiz rad etildi</b>${note ? `: ${note}` : ''}`,
      { href: '/hr?tab=roadmap' },
    );
    revalidatePath('/', 'layout'); // rol almashtirgich + /hr yangilanadi
    return { ok: true };
  } catch (e) {
    console.error('[position-request] review failed', e);
    return { error: 'failed' };
  }
}

export async function approvePositionRequestAction(id: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!isCeo(heldRoles(profile))) return { error: 'forbidden' };
  return applyReview(user.id, id, true, '');
}
export async function rejectPositionRequestAction(id: string, note: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!isCeo(heldRoles(profile))) return { error: 'forbidden' };
  return applyReview(user.id, id, false, (note ?? '').toString().trim().slice(0, 300));
}

'use server';

import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { tashkentDayKey } from '@/lib/time';

// Har bir xodimning shaxsiy kunlik checklisti. Bandlar takrorlanadi (har kuni
// chiqadi); "bajarilgan" holati kun bo'yicha checklist_ticks'da saqlanadi.
// Har amal o'z autentifikatsiyasini qayta tekshiradi va faqat o'z yozuviga tegadi.

export type ChecklistResult = { error: string } | { ok: true; id?: string };

export async function addChecklistItemAction(title: string): Promise<ChecklistResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  const t = (title ?? '').trim();
  if (!t) return { error: 'empty' };
  if (t.length > 120) return { error: 'tooLong' };
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into checklist_items (user_id, title, sort)
      values (${user.id}, ${t}, coalesce((select max(sort) + 1 from checklist_items where user_id = ${user.id}), 0))
      returning id`;
    revalidatePath('/[locale]/dashboard', 'page');
    return { ok: true, id: row.id };
  } catch (e) {
    console.error('[checklist] add failed', e);
    return { error: 'failed' };
  }
}

export async function deleteChecklistItemAction(id: string): Promise<ChecklistResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!id) return { error: 'empty' };
  try {
    await sql`delete from checklist_items where id = ${id} and user_id = ${user.id}`;
    revalidatePath('/[locale]/dashboard', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[checklist] delete failed', e);
    return { error: 'failed' };
  }
}

export async function toggleChecklistAction(itemId: string, done: boolean): Promise<ChecklistResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!itemId) return { error: 'empty' };
  const day = tashkentDayKey();
  try {
    const [own] = await sql<{ id: string }[]>`select id from checklist_items where id = ${itemId} and user_id = ${user.id}`;
    if (!own) return { error: 'notFound' };
    if (done) {
      await sql`insert into checklist_ticks (item_id, date_key) values (${itemId}, ${day}) on conflict (item_id, date_key) do nothing`;
    } else {
      await sql`delete from checklist_ticks where item_id = ${itemId} and date_key = ${day}`;
    }
    revalidatePath('/[locale]/dashboard', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[checklist] toggle failed', e);
    return { error: 'failed' };
  }
}

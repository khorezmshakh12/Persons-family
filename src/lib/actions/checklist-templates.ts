'use server';

import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { tashkentDayKey, tashkentWeekKey, tashkentMonthKey } from '@/lib/time';

// Rol bo'yicha checklist shablonlari. Xodim o'z rolining bandini davr bo'yicha
// belgilaydi (toggle). CEO/COO shablonlarni boshqaradi (add/edit/delete/reorder)
// — 'checklist.manage' qobiliyati. Har amal autentifikatsiyani qayta tekshiradi.

export type Cadence = 'daily' | 'weekly' | 'monthly';
export type ChecklistResult = { error: string } | { ok: true; id?: string };

const CADENCES: readonly Cadence[] = ['daily', 'weekly', 'monthly'];

function periodKey(c: Cadence): string {
  return c === 'daily' ? tashkentDayKey() : c === 'weekly' ? tashkentWeekKey() : tashkentMonthKey();
}

export async function toggleTemplateTickAction(templateId: string, cadence: Cadence, done: boolean): Promise<ChecklistResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!templateId || !CADENCES.includes(cadence)) return { error: 'badRequest' };
  try {
    // Faqat o'z rolining joriy cadence bandini belgilay oladi.
    const [tpl] = await sql<{ id: string }[]>`
      select id from checklist_templates
      where id = ${templateId} and role = ${profile.role} and cadence = ${cadence} and active`;
    if (!tpl) return { error: 'notFound' };
    const key = periodKey(cadence);
    if (done) {
      await sql`insert into checklist_template_ticks (template_id, user_id, period_key)
        values (${templateId}, ${user.id}, ${key}) on conflict (template_id, user_id, period_key) do nothing`;
    } else {
      await sql`delete from checklist_template_ticks where template_id = ${templateId} and user_id = ${user.id} and period_key = ${key}`;
    }
    revalidatePath('/[locale]/task-tracker', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[checklist-templates] toggle failed', e);
    return { error: 'failed' };
  }
}

export async function addTemplateAction(input: { role: string; cadence: Cadence; title: string; detail?: string }): Promise<ChecklistResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!can(profile.role, 'checklist.manage')) return { error: 'forbidden' };
  const role = (input.role ?? '').trim();
  const cadence = input.cadence;
  const title = (input.title ?? '').trim();
  const detail = (input.detail ?? '').trim();
  if (!role || !CADENCES.includes(cadence)) return { error: 'badRequest' };
  if (!title || title.length > 200) return { error: 'badTitle' };
  if (detail.length > 2000) return { error: 'badDetail' };
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into checklist_templates (role, cadence, title, detail, sort, created_by)
      values (${role}, ${cadence}, ${title}, ${detail},
        coalesce((select max(sort) + 1 from checklist_templates where role = ${role} and cadence = ${cadence}), 0),
        ${user.id})
      returning id`;
    revalidatePath('/[locale]/task-tracker', 'page');
    return { ok: true, id: row.id };
  } catch (e) {
    console.error('[checklist-templates] add failed', e);
    return { error: 'failed' };
  }
}

export async function editTemplateAction(input: { id: string; title: string; detail?: string }): Promise<ChecklistResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!can(profile.role, 'checklist.manage')) return { error: 'forbidden' };
  const id = input.id;
  const title = (input.title ?? '').trim();
  const detail = (input.detail ?? '').trim();
  if (!id) return { error: 'badRequest' };
  if (!title || title.length > 200) return { error: 'badTitle' };
  if (detail.length > 2000) return { error: 'badDetail' };
  try {
    const res = await sql`update checklist_templates set title = ${title}, detail = ${detail}, updated_at = now() where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
    revalidatePath('/[locale]/task-tracker', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[checklist-templates] edit failed', e);
    return { error: 'failed' };
  }
}

export async function deleteTemplateAction(id: string): Promise<ChecklistResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!can(profile.role, 'checklist.manage')) return { error: 'forbidden' };
  if (!id) return { error: 'badRequest' };
  try {
    await sql`delete from checklist_templates where id = ${id}`;
    revalidatePath('/[locale]/task-tracker', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[checklist-templates] delete failed', e);
    return { error: 'failed' };
  }
}

export async function reorderTemplatesAction(ids: string[]): Promise<ChecklistResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!can(profile.role, 'checklist.manage')) return { error: 'forbidden' };
  if (!Array.isArray(ids) || ids.length === 0) return { error: 'badRequest' };
  try {
    await sql.begin(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx`update checklist_templates set sort = ${i} where id = ${ids[i]}`;
      }
    });
    revalidatePath('/[locale]/task-tracker', 'page');
    return { ok: true };
  } catch (e) {
    console.error('[checklist-templates] reorder failed', e);
    return { error: 'failed' };
  }
}

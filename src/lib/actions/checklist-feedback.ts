'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { canFor, isLeadershipRole } from '@/lib/permissions';
import { notifyUsers } from '@/lib/telegram';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';

export type FeedbackResult = { error?: string };

const addSchema = z.object({
  userId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  templateId: z.string().uuid().nullable(),
  body: z.string().trim().min(1).max(1000),
});

/** A monitor's note on an employee's checklist day (templateId null) or on
 * one item. CEO/COO checklists are only open to CEO/COO. The employee gets a
 * bell + Telegram notice. */
export async function addChecklistFeedbackAction(input: {
  userId: string;
  day: string;
  templateId: string | null;
  body: string;
}): Promise<FeedbackResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!canFor(profile, 'checklist.feedback')) return { error: 'forbidden' };
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid' };
  const { userId, day, templateId, body } = parsed.data;
  if (userId === user.id) return { error: 'self' };
  const today = tashkentDayKey();
  if (day > today || day < addDaysToKey(today, -60)) return { error: 'day' };

  try {
    const [target] = await sql<{ roles: string[]; is_active: boolean }[]>`
      select p.is_active,
        array[p.role::text] || array(select r.role::text from profile_roles r where r.user_id = p.id) as roles
      from profiles p where p.id = ${userId}`;
    if (!target?.is_active) return { error: 'notFound' };
    if (!isLeadershipRole(profile.role) && target.roles.some(isLeadershipRole)) return { error: 'forbidden' };

    let itemTitle: string | null = null;
    if (templateId) {
      const [tpl] = await sql<{ title: string; role: string }[]>`
        select title, role from checklist_templates where id = ${templateId}`;
      if (!tpl || !target.roles.includes(tpl.role)) return { error: 'invalid' };
      itemTitle = tpl.title;
    }

    await sql`
      insert into checklist_feedback (user_id, day, template_id, item_title, body, author_id)
      values (${userId}, ${day}::date, ${templateId}, ${itemTitle}, ${body}, ${user.id})`;

    const author = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
    const what = itemTitle ? `«${itemTitle}» bandiga` : `${day} kungi checklistingizga`;
    await notifyUsers('checklist', [userId], `📝 ${author} ${what} izoh yozdi:\n${body}`, {
      href: '/task-tracker',
    }).catch(() => {});
  } catch (error) {
    console.error('addChecklistFeedbackAction', error);
    return { error: 'saveFailed' };
  }
  revalidatePath('/task-tracker');
  return {};
}

/** The author takes their own note back. */
export async function deleteChecklistFeedbackAction(id: string): Promise<FeedbackResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalid' };
  try {
    const res = await sql`delete from checklist_feedback where id = ${id} and author_id = ${user.id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch (error) {
    console.error('deleteChecklistFeedbackAction', error);
    return { error: 'saveFailed' };
  }
  revalidatePath('/task-tracker');
  return {};
}

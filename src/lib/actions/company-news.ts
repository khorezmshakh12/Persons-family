'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { requireAdmin, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';
import { bumpSignal } from '@/lib/gcp/firestoreAdmin';

export type CompanyNewsActionState = { error?: string } | undefined;

/** Fire-and-forget broadcast to every staff member with Telegram connected
 * — never let a Telegram hiccup affect the response to the admin who just
 * published the post (mirrors notifyIssueCreated in actions/issues.ts). */
async function notifyCompanyNews({ title }: { title: string }) {
  try {
    const staff = await sql<{ telegram_id: number }[]>`
      select telegram_id from profiles where telegram_id is not null
    `;
    const text = `Kompaniya yangiligi: <b>${escapeTelegramText(title)}</b>`;
    await sendTelegramMessageToMany(staff.map((s) => s.telegram_id), text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

const createNewsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
});

export async function createNewsAction(
  _prevState: CompanyNewsActionState,
  formData: FormData,
): Promise<CompanyNewsActionState> {
  let actingUserId: string;
  try {
    const { user } = await requireAdmin();
    actingUserId = user.id;
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = createNewsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  let inserted: { id: string } | undefined;
  try {
    [inserted] = await sql<{ id: string }[]>`
      insert into company_news (title, content, created_by)
      values (${parsed.data.title}, ${parsed.data.content}, ${actingUserId})
      returning id
    `;
  } catch {
    return { error: 'createFailed' };
  }
  if (!inserted) return { error: 'createFailed' };

  // This broadcasts to every active user's nav dot at once (company_news
  // reads are per-user, not per-uid signal docs) — see
  // nav-badges-context.tsx, which listens to this same shared doc.
  await bumpSignal('board_signals/company_news');

  // The author already knows about their own post — no reason for it to
  // show up as "unread" for them on the sidebar dot. `after()` here too —
  // see staff-chats.ts's comment: Vercel can tear down a bare un-awaited
  // call before it finishes.
  after(() => sql`insert into company_news_reads (news_id, user_id) values (${inserted.id}, ${actingUserId})`);

  after(() => notifyCompanyNews({ title: parsed.data.title }));

  revalidatePath('/[locale]/company-news', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  return {};
}

const deleteNewsSchema = z.object({ id: z.string().uuid() });

export type DeleteNewsResult = { error?: string };

/** Open to the post's own author or an admin. */
export async function deleteNewsAction(formData: FormData): Promise<DeleteNewsResult> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };
  const isAdmin = profile.role === 'ceo';

  const parsed = deleteNewsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [news] = await sql<{ created_by: string }[]>`select created_by from company_news where id = ${parsed.data.id}`;
  if (!news) return { error: 'notFound' };
  if (!isAdmin && news.created_by !== user.id) return { error: 'forbidden' };

  try {
    await sql`delete from company_news where id = ${parsed.data.id}`;
  } catch (error) {
    console.error('deleteNewsAction failed', error instanceof Error ? error.message : error);
    return { error: 'deleteFailed' };
  }

  await bumpSignal('board_signals/company_news');

  revalidatePath('/[locale]/company-news', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  return {};
}

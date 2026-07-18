'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';

export type CompanyNewsActionState = { error?: string } | undefined;

/** Fire-and-forget broadcast to every staff member with Telegram connected
 * — never let a Telegram hiccup affect the response to the admin who just
 * published the post (mirrors notifyIssueCreated in actions/issues.ts). */
async function notifyCompanyNews({
  title,
  supabase,
}: {
  title: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  try {
    const { data: staff } = await supabase.from('profiles').select('telegram_id').not('telegram_id', 'is', null);
    const text = `Kompaniya yangiligi: <b>${escapeTelegramText(title)}</b>`;
    await sendTelegramMessageToMany((staff ?? []).map((s) => s.telegram_id), text);
  } catch (err) {
    console.error('Failed to send company news Telegram broadcast:', err);
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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = createNewsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('company_news').insert({
    title: parsed.data.title,
    content: parsed.data.content,
    created_by: actingUserId,
  });
  if (error) return { error: 'createFailed' };

  void notifyCompanyNews({ title: parsed.data.title, supabase });

  revalidatePath('/[locale]/company-news', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  return {};
}

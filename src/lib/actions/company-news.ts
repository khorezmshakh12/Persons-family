'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';

export type CompanyNewsActionState = { error?: string } | undefined;

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

  revalidatePath('/[locale]/company-news', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  return {};
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { requireAdmin } from '@/lib/auth/require-admin';

export type IssueActionState = { error?: string } | undefined;

const createIssueSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function createIssueAction(
  _prevState: IssueActionState,
  formData: FormData,
): Promise<IssueActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = createIssueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('issues').insert({
    created_by: user.id,
    title: parsed.data.title,
    description: parsed.data.description || null,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/issues', 'page');
  return {};
}

const STATUSES = ['open', 'in_progress', 'done'] as const;

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export async function updateIssueStatusAction(formData: FormData): Promise<void> {
  let actingUserId: string;
  try {
    const { user } = await requireAdmin();
    actingUserId = user.id;
  } catch {
    return;
  }

  const parsed = updateStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from('issues')
    .update({
      status: parsed.data.status,
      resolved_by: parsed.data.status === 'done' ? actingUserId : null,
      resolved_at: parsed.data.status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.id);

  revalidatePath('/[locale]/issues', 'page');
}

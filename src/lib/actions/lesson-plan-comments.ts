'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

export type CommentActionState = { error?: string } | undefined;

const createCommentSchema = z.object({
  dayId: z.string().uuid(),
  commentText: z.string().trim().min(1).max(1000),
});

export async function createCommentAction(
  _prevState: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const isAuthorized = profile.role === 'ceo' || profile.role === 'admin_manager' || profile.role === 'assistant';
  if (!isAuthorized) return { error: 'forbidden' };

  const parsed = createCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('lesson_plan_comments').insert({
    lesson_plan_day_id: parsed.data.dayId,
    user_id: user.id,
    comment_text: parsed.data.commentText,
  });
  if (error) return { error: 'createFailed' };

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const { user } = await getAuthState();
  if (!user) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from('lesson_plan_comments').delete().eq('id', parsed.data.id);

  revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
}

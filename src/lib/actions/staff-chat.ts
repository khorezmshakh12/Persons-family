'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

export type StaffChatActionState = { error?: string } | undefined;

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(2000),
});

export async function sendStaffChatMessageAction(
  _prevState: StaffChatActionState,
  formData: FormData,
): Promise<StaffChatActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile || (profile.role !== 'teacher' && profile.role !== 'assistant')) {
    return { error: 'forbidden' };
  }

  const parsed = sendMessageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidMessage' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_chat_messages').insert({
    conversation_id: parsed.data.conversationId,
    user_id: user.id,
    content: parsed.data.content,
  });
  if (error) return { error: 'sendFailed' };

  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteStaffChatMessageAction(formData: FormData): Promise<void> {
  const { user } = await getAuthState();
  if (!user) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from('staff_chat_messages').delete().eq('id', parsed.data.id).eq('user_id', user.id);
}

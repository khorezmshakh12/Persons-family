'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

export type ChatActionState = { error?: string } | undefined;

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export async function sendMessageAction(
  _prevState: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = sendMessageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidMessage' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('chat_messages')
    .insert({ user_id: user.id, content: parsed.data.content });
  if (error) return { error: 'sendFailed' };

  return {};
}

const deleteMessageSchema = z.object({ id: z.string().uuid() });

export async function deleteMessageAction(formData: FormData): Promise<void> {
  const { user } = await getAuthState();
  if (!user) return;

  const parsed = deleteMessageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from('chat_messages').delete().eq('id', parsed.data.id).eq('user_id', user.id);
}

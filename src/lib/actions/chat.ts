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
  const { user, profile } = await getAuthState();
  if (!user || !profile) return;

  const parsed = deleteMessageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const isAdmin = profile.role === 'ceo' || profile.role === 'admin_manager';
  const supabase = await createClient();
  let query = supabase.from('chat_messages').delete().eq('id', parsed.data.id);
  if (!isAdmin) query = query.eq('user_id', user.id);
  await query;
}

const pinMessageSchema = z.object({ id: z.string().uuid(), pin: z.enum(['true', 'false']) });

export async function toggleMessagePinAction(formData: FormData): Promise<void> {
  const { profile } = await getAuthState();
  if (!profile || (profile.role !== 'ceo' && profile.role !== 'admin_manager')) return;

  const parsed = pinMessageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from('chat_messages')
    .update({ pinned_at: parsed.data.pin === 'true' ? new Date().toISOString() : null })
    .eq('id', parsed.data.id);
}

const toggleChatEnabledSchema = z.object({ enabled: z.enum(['true', 'false']) });

export async function toggleChatEnabledAction(formData: FormData): Promise<void> {
  const { user, profile } = await getAuthState();
  if (!user || !profile || (profile.role !== 'ceo' && profile.role !== 'admin_manager')) return;

  const parsed = toggleChatEnabledSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from('app_settings')
    .update({
      chat_enabled: parsed.data.enabled === 'true',
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true);
}

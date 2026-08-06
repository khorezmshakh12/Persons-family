'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';
import { GLOBAL_STAFF_CHAT_ID } from '@/lib/staff-chat';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';

export type StaffChatActionState = { error?: string } | undefined;

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(2000),
});

/** Fire-and-forget notification for a group's 2-person teacher/TA chat
 * (conversation_id === that group's id). Deliberately skipped for
 * GLOBAL_STAFF_CHAT_ID — that room is a broadcast to every teacher/
 * assistant in the company, and pinging all of them on every message
 * would be spam, not a notification. */
async function notifyGroupChatMessage({
  conversationId,
  senderId,
  senderName,
  content,
  supabase,
}: {
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  if (conversationId === GLOBAL_STAFF_CHAT_ID) return;
  try {
    const { data: group } = await supabase
      .from('groups')
      .select('teacher_id, assigned_ta_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (!group) return;

    const recipientIds = [group.teacher_id, group.assigned_ta_id].filter(
      (id): id is string => Boolean(id) && id !== senderId,
    );
    if (recipientIds.length === 0) return;

    const { data: recipients } = await supabase
      .from('profiles')
      .select('telegram_id')
      .in('id', recipientIds);

    const text = `<b>${escapeTelegramText(senderName)}</b> guruh chatiga yozdi:\n${escapeTelegramText(content)}`;
    await sendTelegramMessageToMany((recipients ?? []).map((r) => r.telegram_id), text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

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

  void notifyGroupChatMessage({
    conversationId: parsed.data.conversationId,
    senderId: user.id,
    senderName: `${profile.first_name} ${profile.last_name}`,
    content: parsed.data.content,
    supabase,
  });

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

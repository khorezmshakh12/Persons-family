'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';
import { mirrorGroupChatMessage, deleteGroupChatMessageMirror } from '@/lib/gcp/firestoreAdmin';

export type StaffChatActionState = { error?: string } | undefined;

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(2000),
});

/** Fire-and-forget notification for a group's 2-person teacher/TA chat
 * (conversation_id === that group's id). */
async function notifyGroupChatMessage({
  conversationId,
  senderId,
  senderName,
  content,
}: {
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
}) {
  try {
    const [group] = await sql<{ teacher_id: string | null; assigned_ta_id: string | null }[]>`
      select teacher_id, assigned_ta_id from groups where id = ${conversationId}
    `;
    if (!group) return;

    const recipientIds = [group.teacher_id, group.assigned_ta_id].filter(
      (id): id is string => Boolean(id) && id !== senderId,
    );
    if (recipientIds.length === 0) return;

    const recipients = await sql<{ telegram_id: number }[]>`
      select telegram_id from profiles where id in ${sql(recipientIds)}
    `;

    const text = `<b>${escapeTelegramText(senderName)}</b> guruh chatiga yozdi:\n${escapeTelegramText(content)}`;
    await sendTelegramMessageToMany(recipients.map((r) => r.telegram_id), text);
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

  const [inserted] = await sql<{ id: string; created_at: string }[]>`
    insert into staff_chat_messages (conversation_id, user_id, content)
    values (${parsed.data.conversationId}, ${user.id}, ${parsed.data.content})
    returning id, created_at
  `;

  // Mirrors into group_chats/{groupId}/messages for instant delivery — see
  // lib/gcp/firestoreAdmin.ts's mirrorGroupChatMessage(). Membership for
  // this thread (group_chat_meta/{groupId}) is kept in sync by
  // groups.ts's syncGroupChatMembers(), not written here.
  await mirrorGroupChatMessage({
    groupId: parsed.data.conversationId,
    messageId: inserted.id,
    senderId: user.id,
    content: parsed.data.content,
    createdAt: inserted.created_at,
  });

  // See staff-chats.ts's identical `after()` comment — a bare un-awaited
  // call here can get killed mid-flight by Vercel before the Telegram send
  // finishes.
  after(() =>
    notifyGroupChatMessage({
      conversationId: parsed.data.conversationId,
      senderId: user.id,
      senderName: `${profile.first_name} ${profile.last_name}`,
      content: parsed.data.content,
    }),
  );

  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteStaffChatMessageAction(formData: FormData): Promise<void> {
  const { user } = await getAuthState();
  if (!user) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const [deleted] = await sql<{ conversation_id: string }[]>`
    delete from staff_chat_messages where id = ${parsed.data.id} and user_id = ${user.id}
    returning conversation_id
  `;
  if (deleted) await deleteGroupChatMessageMirror(deleted.conversation_id, parsed.data.id);
}

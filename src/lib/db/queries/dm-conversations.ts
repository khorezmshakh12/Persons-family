import 'server-only';
import { sql } from '@/lib/db/client';

export type DmRequestStatus = 'pending' | 'accepted';

/** Straight port of start_dm_conversation(): CEO on either side bypasses
 * the request/accept step entirely (including retroactively accepting an
 * existing pending request), everyone else needs the other side to accept
 * first. participant_one/two are always stored as the sorted pair. */
export async function startDmConversation(
  me: string,
  otherUserId: string,
): Promise<{ id: string; requestStatus: DmRequestStatus }> {
  if (me === otherUserId) throw new Error('Cannot start a conversation with yourself');

  const [[myProfile], [otherProfile]] = await Promise.all([
    sql<{ role: string }[]>`select role from profiles where id = ${me}`,
    sql<{ role: string }[]>`select role from profiles where id = ${otherUserId}`,
  ]);
  if (!otherProfile) throw new Error('Recipient not found');

  const bypass = myProfile?.role === 'ceo' || otherProfile.role === 'ceo';
  const [p1, p2] = [me, otherUserId].sort();

  return sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string; request_status: DmRequestStatus }[]>`
      select id, request_status from dm_conversations
      where participant_one = ${p1} and participant_two = ${p2}
    `;

    if (existing) {
      if (bypass && existing.request_status !== 'accepted') {
        await tx`update dm_conversations set request_status = 'accepted' where id = ${existing.id}`;
        return { id: existing.id, requestStatus: 'accepted' };
      }
      return { id: existing.id, requestStatus: existing.request_status };
    }

    const status: DmRequestStatus = bypass ? 'accepted' : 'pending';
    const [created] = await tx<{ id: string }[]>`
      insert into dm_conversations (participant_one, participant_two, created_by, request_status)
      values (${p1}, ${p2}, ${me}, ${status})
      returning id
    `;
    return { id: created.id, requestStatus: status };
  });
}

/** Straight port of respond_to_dm_request() — only the non-requesting
 * participant may accept/decline, and only while still pending. */
export async function respondToDmRequest(userId: string, conversationId: string, accept: boolean): Promise<void> {
  const [convo] = await sql<
    { id: string; created_by: string; participant_one: string; participant_two: string; request_status: string }[]
  >`select id, created_by, participant_one, participant_two, request_status from dm_conversations where id = ${conversationId}`;
  if (!convo) throw new Error('Conversation not found');
  if (convo.created_by === userId) throw new Error('Cannot respond to your own request');
  if (convo.participant_one !== userId && convo.participant_two !== userId) {
    throw new Error('Not a participant in this conversation');
  }
  if (convo.request_status !== 'pending') throw new Error('This request has already been resolved');

  if (accept) {
    await sql`update dm_conversations set request_status = 'accepted' where id = ${conversationId}`;
  } else {
    await sql`delete from dm_conversations where id = ${conversationId}`;
  }
}

/** Straight port of toggle_staff_chat_reaction() — reactions is a jsonb map
 * of emoji -> array of reacting user ids; toggling removes the caller if
 * present, otherwise appends them, and drops the emoji key entirely once
 * its array is empty. Read-modify-write happens inside a transaction with
 * `for update` to avoid a lost update if two reactions land at once. */
export async function toggleStaffChatReaction(
  userId: string,
  messageId: string,
  emoji: string,
): Promise<Record<string, string[]>> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ reactions: Record<string, string[]>; visible: boolean }[]>`
      select reactions, (receiver_id is null or sender_id = ${userId} or receiver_id = ${userId}) as visible
      from staff_chats where id = ${messageId} for update
    `;
    if (!row || !row.visible) throw new Error('Message not found or not accessible');

    const current = row.reactions ?? {};
    const emojiUsers = current[emoji] ?? [];
    const nextEmojiUsers = emojiUsers.includes(userId)
      ? emojiUsers.filter((id) => id !== userId)
      : [...emojiUsers, userId];

    const updated = { ...current };
    if (nextEmojiUsers.length === 0) delete updated[emoji];
    else updated[emoji] = nextEmojiUsers;

    await tx`update staff_chats set reactions = ${sql.json(updated)} where id = ${messageId}`;
    return updated;
  });
}

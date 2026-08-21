'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { createSignedReadUrl, createSignedWriteUrl } from '@/lib/gcp/storage';
import { mirrorChatMessage, bumpNavBadgeSignal, deleteChatMessageMirror } from '@/lib/gcp/firestoreAdmin';
import { startDmConversation, respondToDmRequest, toggleStaffChatReaction } from '@/lib/db/queries/dm-conversations';

const MEDIA_TYPES = ['image', 'video', 'voice', 'none'] as const;

export type SentStaffChatMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  message_text: string | null;
  media_url: string | null;
  media_type: (typeof MEDIA_TYPES)[number];
  pinned_at: string | null;
  created_at: string;
  is_read: boolean;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
};

export type StaffChatsActionState = { error?: string; message?: SentStaffChatMessage } | undefined;
export type UploadUrlResult = { path?: string; url?: string; error?: string };
export type ReadUrlResult = { signedUrl?: string; error?: string };

// media_url is stored permanently on the message row rather than re-signed
// on each read (unlike issue voice notes, which are viewed occasionally from
// a board), so this needs a long expiry.
const CHAT_MEDIA_READ_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 365 * 5;

/** CEO is always reachable — no request/accept step in either direction.
 * Everyone else needs an accepted dm_conversations row before they can
 * exchange messages at all. */
const BYPASS_ROLES = ['ceo'];

const sendSchema = z
  .object({
    receiverId: z.string().uuid(),
    messageText: z.string().trim().max(2000).optional().or(z.literal('')),
    mediaUrl: z.string().max(1000).optional().or(z.literal('')),
    mediaType: z.enum(MEDIA_TYPES).optional(),
    replyToId: z.string().uuid().optional().or(z.literal('')),
  })
  .refine((data) => Boolean(data.messageText) || Boolean(data.mediaUrl), {
    message: 'invalidMessage',
  });

async function isConversationAccepted(userA: string, userB: string) {
  const [participantOne, participantTwo] = [userA, userB].sort();
  const [row] = await sql<{ request_status: string }[]>`
    select request_status from dm_conversations
    where participant_one = ${participantOne} and participant_two = ${participantTwo}
  `;
  return row?.request_status === 'accepted';
}

/** Fire-and-forget DM notification to the receiver, mirroring
 * notifyTaskAssigned/notifyIssueCreated — a Telegram hiccup must never
 * affect the response to the sender who just posted the message. */
async function notifyNewChatMessage({
  senderName,
  messageText,
  hasMedia,
  receiverTelegramId,
}: {
  senderName: string;
  messageText: string | null;
  hasMedia: boolean;
  receiverTelegramId: number | null;
}) {
  if (!receiverTelegramId) return;
  try {
    const preview = messageText ? escapeTelegramText(messageText) : hasMedia ? '📎 Fayl' : '';
    const text = `<b>${escapeTelegramText(senderName)}</b> sizga xabar yubordi:\n${preview}`;
    await sendTelegramMessage(receiverTelegramId, text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * DM history load for chat-hub-client.tsx — this used to be a plain
 * `supabase.from('staff_chats').select(...)` call made directly from the
 * client component (no server round trip at all, relying on RLS for
 * scoping). There's no client-side Postgres access anymore, so this needed
 * a Server Action home; added here rather than left as dead client code
 * during the realtime-components conversion pass, since without it the
 * chat hub can't show any message history at all. Scoping mirrors
 * isConversationAccepted() plus the same sender/receiver pair the old `.or()`
 * filter expressed.
 */
export async function getDmHistoryAction(otherUserId: string): Promise<SentStaffChatMessage[]> {
  const { user } = await getAuthState();
  if (!user) return [];

  const rows = await sql<SentStaffChatMessage[]>`
    select id, sender_id, receiver_id, message_text, media_url, media_type, pinned_at, created_at, is_read, reply_to_id, reactions
    from staff_chats
    where (sender_id = ${user.id} and receiver_id = ${otherUserId})
       or (sender_id = ${otherUserId} and receiver_id = ${user.id})
    order by created_at asc
    limit 100
  `;
  return rows;
}

export async function sendStaffChatAction(
  _prevState: StaffChatsActionState,
  formData: FormData,
): Promise<StaffChatsActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidMessage' };

  const [receiver] = await sql<{ role: string; telegram_id: number | null }[]>`
    select role, telegram_id from profiles where id = ${parsed.data.receiverId}
  `;
  if (!receiver) return { error: 'forbidden' };

  const bypass = BYPASS_ROLES.includes(profile.role) || BYPASS_ROLES.includes(receiver.role);
  if (bypass) {
    // A bypass pair never sees the request step — their very first message
    // just works, so this creates (or upgrades a stale pending row to)
    // 'accepted' transparently before the send below.
    try {
      await startDmConversation(user.id, parsed.data.receiverId);
    } catch {
      return { error: 'sendFailed' };
    }
  } else {
    const accepted = await isConversationAccepted(user.id, parsed.data.receiverId);
    if (!accepted) return { error: 'chatNotAccepted' };
  }

  let data: SentStaffChatMessage | undefined;
  try {
    [data] = await sql<SentStaffChatMessage[]>`
      insert into staff_chats (sender_id, receiver_id, message_text, media_url, media_type, reply_to_id)
      values (
        ${user.id},
        ${parsed.data.receiverId},
        ${parsed.data.messageText || null},
        ${parsed.data.mediaUrl || null},
        ${parsed.data.mediaUrl ? (parsed.data.mediaType ?? 'none') : 'none'},
        ${parsed.data.replyToId || null}
      )
      returning id, sender_id, receiver_id, message_text, media_url, media_type, pinned_at, created_at, is_read, reply_to_id, reactions
    `;
  } catch (error) {
    // A silent failure here is exactly what used to make the optimistic
    // bubble vanish with no explanation — surfacing it is the actual fix,
    // not just a diagnostic nicety.
    console.error('sendStaffChatAction insert failed', error);
    return { error: 'sendFailed' };
  }
  if (!data) return { error: 'sendFailed' };

  await mirrorChatMessage({
    senderId: data.sender_id,
    receiverId: data.receiver_id,
    messageId: data.id,
    messageText: data.message_text,
    mediaUrl: data.media_url,
    mediaType: data.media_type,
    createdAt: data.created_at,
  });
  await bumpNavBadgeSignal(data.receiver_id);

  // `after()`, not a bare un-awaited call — on Vercel, a fire-and-forget
  // promise with no `waitUntil` can get cut off mid-flight the instant this
  // action's response is sent (confirmed in production: the fetch to
  // Telegram's API was starting but never finishing). `after` registers the
  // work with the platform's `waitUntil` so the function stays alive until
  // it actually completes.
  after(() =>
    notifyNewChatMessage({
      senderName: `${profile.first_name} ${profile.last_name}`,
      messageText: parsed.data.messageText || null,
      hasMedia: Boolean(parsed.data.mediaUrl),
      receiverTelegramId: receiver.telegram_id,
    }),
  );

  // Returning the confirmed row lets the caller commit it straight into
  // real (non-optimistic) state instead of waiting on the Firestore mirror
  // echo — that round trip has enough latency that the optimistic bubble
  // could disappear (once its transition settles) before the echo arrives
  // to replace it, which is what "messages disappearing" actually was.
  return { message: data };
}

export type ChatRequestResult = { error?: string; requestStatus?: 'pending' | 'accepted' };

/**
 * Initiates contact with someone who has no existing conversation. A
 * bypass-eligible pair (either side CEO) resolves straight to 'accepted' —
 * same as sendStaffChatAction itself — everyone else gets 'pending' until
 * the recipient calls respondToDmRequestAction.
 */
export async function sendChatRequestAction(receiverId: string): Promise<ChatRequestResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsedId = z.string().uuid().safeParse(receiverId);
  if (!parsedId.success) return { error: 'invalidInput' };

  try {
    const { requestStatus } = await startDmConversation(user.id, parsedId.data);
    return { requestStatus };
  } catch {
    return { error: 'requestFailed' };
  }
}

const respondSchema = z.object({
  conversationId: z.string().uuid(),
  decision: z.enum(['accept', 'decline']),
});

export type RespondToDmRequestState = { error?: string } | undefined;

/** The recipient only — respondToDmRequest itself rejects the requester
 * calling this on their own request. Declining deletes the conversation
 * row outright (see the migration comment); accepting flips it to
 * 'accepted' so both sides can now send. */
export async function respondToDmRequestAction(
  _prevState: RespondToDmRequestState,
  formData: FormData,
): Promise<RespondToDmRequestState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = respondSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await respondToDmRequest(user.id, parsed.data.conversationId, parsed.data.decision === 'accept');
  } catch {
    return { error: 'requestFailed' };
  }

  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteStaffChatAction(formData: FormData): Promise<void> {
  const { user } = await getAuthState();
  if (!user) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  // Self-delete only — the app no longer has an admin-delete carve-out
  // here (Family Chat's admin-delete had no messages left to act on).
  const [deleted] = await sql<{ receiver_id: string }[]>`
    delete from staff_chats where id = ${parsed.data.id} and sender_id = ${user.id}
    returning receiver_id
  `;
  if (deleted) await deleteChatMessageMirror(user.id, deleted.receiver_id, parsed.data.id);
}

const reactionSchema = z.object({ id: z.string().uuid(), emoji: z.string().trim().min(1).max(8) });

/** Toggles the caller's own reaction on a message via toggleStaffChatReaction
 * — see that function's doc comment for why this isn't a plain `.update()`
 * (a blanket update would let any participant overwrite someone else's
 * reaction, not just add their own). */
export async function toggleStaffChatReactionAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = reactionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await toggleStaffChatReaction(user.id, parsed.data.id, parsed.data.emoji);
  } catch {
    return { error: 'reactionFailed' };
  }

  return {};
}

const uploadUrlSchema = z.object({ fileName: z.string().trim().min(1) });

/**
 * Issues a signed upload URL so the browser PUTs the file straight to
 * Cloud Storage — never through this Next.js server — avoiding both Next's
 * default 1MB Server Action body limit and any serverless payload cap.
 * Files are stored under the uploader's own id for attribution, matching
 * every other bucket's convention in this app.
 */
export async function requestChatMediaUploadUrlAction(fileName: string, fileType: string): Promise<UploadUrlResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = uploadUrlSchema.safeParse({ fileName });
  if (!parsed.success) return { error: 'invalidInput' };

  const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${user.id}/${crypto.randomUUID()}-${sanitized}`;

  const url = await createSignedWriteUrl('chat_media', path, fileType);
  return { path, url };
}

/**
 * Signs the just-uploaded object for reading, right after the browser
 * finishes the PUT. Scoped here to only the caller's own uploads by
 * re-deriving the expected path prefix.
 */
export async function requestChatMediaReadUrlAction(path: string): Promise<ReadUrlResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  if (!path.startsWith(`${user.id}/`)) return { error: 'forbidden' };

  const signedUrl = await createSignedReadUrl('chat_media', path, CHAT_MEDIA_READ_URL_EXPIRY_SECONDS);
  return { signedUrl };
}

const dmStatusSchema = z.object({
  conversationId: z.string().uuid(),
  status: z.enum(['normal', 'important']),
});

/** CEO only — marking a DM "Important" is what makes it surface on the
 * general chat list; neither participant can do this themselves. */
export async function setDmConversationStatusAction(
  _prevState: StaffChatsActionState,
  formData: FormData,
): Promise<StaffChatsActionState> {
  const { profile } = await getAuthState();
  if (!profile || profile.role !== 'ceo') return { error: 'forbidden' };

  const parsed = dmStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  await sql`update dm_conversations set status = ${parsed.data.status} where id = ${parsed.data.conversationId}`;

  return {};
}

export type ModerationConversationRow = {
  id: string;
  status: 'normal' | 'important';
  one: { first_name: string; last_name: string } | null;
  two: { first_name: string; last_name: string } | null;
};

/** CEO only — backs ImportantChatsPanel, a moderation view of who's DMing
 * whom (not a message reader: dm_conversations carries no message content,
 * only participants + status). */
export async function listDmConversationsForModerationAction(all: boolean): Promise<ModerationConversationRow[]> {
  const { profile } = await getAuthState();
  if (!profile || profile.role !== 'ceo') return [];

  return sql<ModerationConversationRow[]>`
    select
      c.id, c.status,
      case when one.id is null then null else json_build_object('first_name', one.first_name, 'last_name', one.last_name) end as one,
      case when two.id is null then null else json_build_object('first_name', two.first_name, 'last_name', two.last_name) end as two
    from dm_conversations c
    left join profiles one on one.id = c.participant_one
    left join profiles two on two.id = c.participant_two
    where ${all} or c.status = 'important'
    order by c.created_at desc
  `;
}

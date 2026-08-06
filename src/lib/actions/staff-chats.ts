'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthState } from '@/lib/auth/session';
import { escapeTelegramText, sendTelegramMessage, sendTelegramMessageToMany } from '@/lib/telegram';

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
export type UploadUrlResult = { path?: string; token?: string; error?: string };
export type ReadUrlResult = { signedUrl?: string; error?: string };

// media_url is stored permanently on the message row rather than re-signed
// on each read (unlike issue voice notes, which are viewed occasionally from
// a board), so this needs a long expiry.
const CHAT_MEDIA_READ_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 365 * 5;

/** CEO and IT Developer are always reachable — no request/accept step in
 * either direction. Everyone else needs an accepted dm_conversations row
 * before they can exchange messages at all. */
const BYPASS_ROLES = ['ceo', 'it_developer'];

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

async function isConversationAccepted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userA: string,
  userB: string,
) {
  const [participantOne, participantTwo] = [userA, userB].sort();
  const { data } = await supabase
    .from('dm_conversations')
    .select('request_status')
    .eq('participant_one', participantOne)
    .eq('participant_two', participantTwo)
    .maybeSingle();
  return data?.request_status === 'accepted';
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

/** Company-wide, content-free ping so every connected staff member knows
 * chat activity is happening, without exposing a private DM's body to
 * anyone but its actual recipient (notifyNewChatMessage above still
 * carries the real content, to the receiver only — this is deliberately
 * separate so a broader "someone's chatting" notice never leaks what was
 * actually said). */
async function notifyCompanyOfChatActivity({
  senderId,
  receiverId,
  senderName,
  supabase,
}: {
  senderId: string;
  receiverId: string;
  senderName: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  try {
    const { data: staff } = await supabase
      .from('profiles')
      .select('id, telegram_id')
      .not('telegram_id', 'is', null);
    const others = (staff ?? []).filter((p) => p.id !== senderId && p.id !== receiverId);
    if (others.length === 0) return;

    const text = `<b>${escapeTelegramText(senderName)}</b> chatda yangi xabar yozdi.`;
    await sendTelegramMessageToMany(others.map((o) => o.telegram_id), text);
  } catch (error) {
    console.error('Telegram broadcast notification failed:', error instanceof Error ? error.message : error);
  }
}

export async function sendStaffChatAction(
  _prevState: StaffChatsActionState,
  formData: FormData,
): Promise<StaffChatsActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'forbidden' };

  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidMessage' };

  const supabase = await createClient();

  const { data: receiver } = await supabase
    .from('profiles')
    .select('role, telegram_id')
    .eq('id', parsed.data.receiverId)
    .maybeSingle();
  if (!receiver) return { error: 'forbidden' };

  const bypass = BYPASS_ROLES.includes(profile.role) || BYPASS_ROLES.includes(receiver.role);
  if (bypass) {
    // A bypass pair never sees the request step — their very first message
    // just works, so this creates (or upgrades a stale pending row to)
    // 'accepted' transparently before the send below.
    const { error: rpcError } = await supabase.rpc('start_dm_conversation', {
      other_user_id: parsed.data.receiverId,
    });
    if (rpcError) return { error: 'sendFailed' };
  } else {
    const accepted = await isConversationAccepted(supabase, user.id, parsed.data.receiverId);
    if (!accepted) return { error: 'chatNotAccepted' };
  }

  const { data, error } = await supabase
    .from('staff_chats')
    .insert({
      sender_id: user.id,
      receiver_id: parsed.data.receiverId,
      message_text: parsed.data.messageText || null,
      media_url: parsed.data.mediaUrl || null,
      media_type: parsed.data.mediaUrl ? (parsed.data.mediaType ?? 'none') : 'none',
      // reply_to_id points at a row the RLS select policy already scopes to
      // this DM, so a stray/foreign id here just fails the FK constraint
      // rather than leaking anything.
      reply_to_id: parsed.data.replyToId || null,
    })
    .select(
      'id, sender_id, receiver_id, message_text, media_url, media_type, pinned_at, created_at, is_read, reply_to_id, reactions',
    )
    .single();
  if (error || !data) {
    // A silent failure here is exactly what used to make the optimistic
    // bubble vanish with no explanation — surfacing it is the actual fix,
    // not just a diagnostic nicety.
    console.error('sendStaffChatAction insert failed', error);
    return { error: 'sendFailed' };
  }

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
  after(() =>
    notifyCompanyOfChatActivity({
      senderId: user.id,
      receiverId: parsed.data.receiverId,
      senderName: `${profile.first_name} ${profile.last_name}`,
      supabase,
    }),
  );

  // Returning the confirmed row lets the caller commit it straight into
  // real (non-optimistic) state instead of waiting on the Realtime INSERT
  // echo — that round trip has enough latency that the optimistic bubble
  // could disappear (once its transition settles) before the echo arrives
  // to replace it, which is what "messages disappearing" actually was.
  return { message: data as SentStaffChatMessage };
}

export type ChatRequestResult = { error?: string; requestStatus?: 'pending' | 'accepted' };

/**
 * Initiates contact with someone who has no existing conversation. A
 * bypass-eligible pair (either side CEO/IT Developer) resolves straight to
 * 'accepted' — same RPC sendStaffChatAction itself calls — everyone else
 * gets 'pending' until the recipient calls respondToDmRequestAction.
 */
export async function sendChatRequestAction(receiverId: string): Promise<ChatRequestResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsedId = z.string().uuid().safeParse(receiverId);
  if (!parsedId.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_dm_conversation', {
    other_user_id: parsedId.data,
  });
  if (error || !data || data.length === 0) return { error: 'requestFailed' };

  return { requestStatus: data[0].request_status };
}

const respondSchema = z.object({
  conversationId: z.string().uuid(),
  decision: z.enum(['accept', 'decline']),
});

export type RespondToDmRequestState = { error?: string } | undefined;

/** The recipient only — respond_to_dm_request itself rejects the requester
 * calling this on their own request. Declining deletes the conversation
 * row outright (see the migration comment); accepting flips it to
 * 'accepted' so both sides can now send. */
export async function respondToDmRequestAction(
  _prevState: RespondToDmRequestState,
  formData: FormData,
): Promise<RespondToDmRequestState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = respondSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('respond_to_dm_request', {
    target_conversation_id: parsed.data.conversationId,
    accept: parsed.data.decision === 'accept',
  });
  if (error) return { error: 'requestFailed' };

  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteStaffChatAction(formData: FormData): Promise<void> {
  const { user } = await getAuthState();
  if (!user) return;

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const supabase = await createClient();
  // RLS covers self-delete (the only case that still applies now that
  // Family Chat's admin-delete carve-out has no messages left to act on).
  await supabase.from('staff_chats').delete().eq('id', parsed.data.id);
}

const reactionSchema = z.object({ id: z.string().uuid(), emoji: z.string().trim().min(1).max(8) });

/** Toggles the caller's own reaction on a message via the security-definer
 * toggle_staff_chat_reaction RPC — see that function's migration comment for
 * why this isn't a plain `.update()` (a blanket UPDATE grant would let any
 * participant overwrite someone else's reaction, not just add their own).
 * The realtime UPDATE this triggers is what actually syncs the change to
 * every other open client; there's no local optimistic step here. */
export async function toggleStaffChatReactionAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = reactionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('toggle_staff_chat_reaction', {
    message_id: parsed.data.id,
    emoji: parsed.data.emoji,
  });
  if (error) return { error: 'reactionFailed' };

  return {};
}

const uploadUrlSchema = z.object({ fileName: z.string().trim().min(1) });

/**
 * Issues a signed upload URL so the browser sends the file straight to
 * Supabase Storage — never through this Next.js server — avoiding both
 * Next's default 1MB Server Action body limit and Vercel's 4.5MB
 * serverless payload cap. Files are stored under the uploader's own id for
 * attribution, matching every other bucket's convention in this app.
 */
export async function requestChatMediaUploadUrlAction(fileName: string): Promise<UploadUrlResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const parsed = uploadUrlSchema.safeParse({ fileName });
  if (!parsed.success) return { error: 'invalidInput' };

  const sanitized = parsed.data.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${user.id}/${crypto.randomUUID()}-${sanitized}`;

  // Path is always scoped to the caller's own id, so the admin client (which
  // bypasses storage RLS — currently missing its INSERT policies on the new
  // Frankfurt project) doesn't widen access beyond what the user already had.
  const { data, error } = await createAdminClient()
    .storage.from('chat_media')
    .createSignedUploadUrl(path);
  if (error || !data) return { error: 'uploadFailed' };

  return { path, token: data.token };
}

/**
 * Signs the just-uploaded object for reading, right after the browser
 * finishes uploadToSignedUrl. Must go through the server (not the client's
 * own supabase.storage.createSignedUrl) since storage RLS is missing on the
 * new Frankfurt project — the admin client is scoped here to only the
 * caller's own uploads by re-deriving the expected path prefix.
 */
export async function requestChatMediaReadUrlAction(path: string): Promise<ReadUrlResult> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };
  if (!path.startsWith(`${user.id}/`)) return { error: 'forbidden' };

  const { data, error } = await createAdminClient()
    .storage.from('chat_media')
    .createSignedUrl(path, CHAT_MEDIA_READ_URL_EXPIRY_SECONDS);
  if (error || !data) return { error: 'uploadFailed' };

  return { signedUrl: data.signedUrl };
}

const dmStatusSchema = z.object({
  conversationId: z.string().uuid(),
  status: z.enum(['normal', 'important']),
});

/** CEO/IT Developer only — mirrors dm_conversations_update_important_flag's
 * RLS check. Marking a DM "Important" is what makes it surface on the
 * general chat list; neither participant can do this themselves (see the
 * migration comment for why it's scoped this way rather than to either
 * participant). */
export async function setDmConversationStatusAction(
  _prevState: StaffChatsActionState,
  formData: FormData,
): Promise<StaffChatsActionState> {
  const { profile } = await getAuthState();
  if (!profile || (profile.role !== 'ceo' && profile.role !== 'it_developer'))
    return { error: 'forbidden' };

  const parsed = dmStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('dm_conversations')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.conversationId);
  if (error) return { error: 'updateFailed' };

  return {};
}

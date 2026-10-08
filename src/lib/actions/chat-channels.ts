'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { bumpNavBadgeSignal, bumpSignal } from '@/lib/gcp/firestoreAdmin';
import {
  canModerateChannel,
  canPostChannel,
  channelAudience,
  channelFor,
  channelMessageCols,
  loadChannelSummaries,
  loadViewer,
  notifyMentions,
  type ChannelMessage,
  type ChannelSummary,
  type ChatStatus,
} from '@/lib/chat-channels';

type Result = { error?: string };

const uuid = z.string().uuid();
const MEDIA = ['image', 'video', 'voice', 'file', 'none'] as const;

/** Live delivery: open tabs re-fetch through these actions when it fires. */
const signal = (channelId: string) => bumpSignal(`board_signals/chat-${channelId}`).catch(() => {});

/* ------------------------------------------------------------ read */

export async function listChannelsAction(): Promise<ChannelSummary[]> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return [];
  return loadChannelSummaries(await loadViewer(user.id, profile.role));
}

export type ChannelPage = {
  messages: ChannelMessage[];
  pinned: ChannelMessage[];
  scheduled: ChannelMessage[];
  audience: string[];
  canPost: boolean;
  canModerate: boolean;
  muted: boolean;
  hasMore: boolean;
};

/** The latest 80 top-level posts (or the 80 before `before`), pins, and the
 * viewer's own still-scheduled posts. */
export async function getChannelPageAction(channelId: string, before?: string): Promise<ChannelPage | { error: string }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!uuid.safeParse(channelId).success) return { error: 'invalidInput' };
  const viewer = await loadViewer(user.id, profile.role);
  const c = await channelFor(viewer, channelId);
  if (!c) return { error: 'forbidden' };
  const cutoff = before && !Number.isNaN(Date.parse(before)) ? before : null;

  const [rows, pinned, scheduled, audience, [mem]] = await Promise.all([
    sql<ChannelMessage[]>`
      select * from (
        select ${channelMessageCols()} from chat_channel_messages m
        where m.channel_id = ${channelId} and m.thread_id is null and m.send_at <= now()
          ${cutoff ? sql`and m.send_at < ${cutoff}` : sql``}
        order by m.send_at desc limit 81
      ) latest order by send_at asc`,
    sql<ChannelMessage[]>`
      select ${channelMessageCols()} from chat_channel_messages m
      where m.channel_id = ${channelId} and m.pinned_at is not null and m.send_at <= now()
      order by m.pinned_at desc limit 20`,
    sql<ChannelMessage[]>`
      select ${channelMessageCols()} from chat_channel_messages m
      where m.channel_id = ${channelId} and m.sender_id = ${user.id} and m.send_at > now()
      order by m.send_at asc`,
    channelAudience(c),
    sql<{ muted: boolean }[]>`select muted from chat_channel_members where channel_id = ${channelId} and user_id = ${user.id}`,
  ]);
  const hasMore = rows.length > 80;
  return {
    messages: hasMore ? rows.slice(1) : rows,
    pinned,
    scheduled,
    audience,
    canPost: canPostChannel(viewer, c, c.is_member),
    canModerate: canModerateChannel(viewer, c, c.is_admin),
    muted: mem?.muted ?? false,
    hasMore,
  };
}

export async function getThreadAction(messageId: string): Promise<{ root: ChannelMessage; replies: ChannelMessage[] } | { error: string }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!uuid.safeParse(messageId).success) return { error: 'invalidInput' };
  const [root] = await sql<ChannelMessage[]>`select ${channelMessageCols()} from chat_channel_messages m where m.id = ${messageId}`;
  if (!root || !(await channelFor(await loadViewer(user.id, profile.role), root.channel_id))) return { error: 'forbidden' };
  // The latest 300 replies, shown oldest-first.
  const replies = await sql<ChannelMessage[]>`
    select * from (
      select ${channelMessageCols()} from chat_channel_messages m
      where m.thread_id = ${messageId} and m.send_at <= now() order by m.send_at desc limit 300
    ) latest order by send_at`;
  return { root, replies };
}

export async function markChannelReadAction(channelId: string): Promise<boolean> {
  const { user, profile } = await getAuthState();
  if (!user || !profile || !uuid.safeParse(channelId).success) return false;
  const c = await channelFor(await loadViewer(user.id, profile.role), channelId);
  if (!c) return false;
  try {
    // Unread @mentions here feed the sidebar "chat" dot — clear it if any.
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from chat_channel_messages x
      left join chat_channel_members m on m.channel_id = x.channel_id and m.user_id = ${user.id}
      where x.channel_id = ${channelId} and ${user.id} = any(x.mentions) and x.send_at <= now()
        and x.send_at > coalesce(m.last_read_at, now() - interval '3 days')`;
    await sql`
      insert into chat_channel_members (channel_id, user_id, last_read_at) values (${channelId}, ${user.id}, now())
      on conflict (channel_id, user_id) do update set last_read_at = now()`;
    if (n > 0) await bumpNavBadgeSignal(user.id).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ write */

const sendSchema = z
  .object({
    channelId: uuid,
    body: z.string().trim().max(4000).optional().default(''),
    mediaUrl: z.string().max(1000).optional().default(''),
    mediaType: z.enum(MEDIA).optional().default('none'),
    threadId: uuid.optional(),
    mentions: z.array(uuid).max(50).optional().default([]),
    /** ISO time in the future → a scheduled post. */
    sendAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((d) => !!d.body || !!d.mediaUrl, { message: 'empty' });

export async function sendChannelMessageAction(input: z.input<typeof sendSchema>): Promise<Result & { message?: ChannelMessage }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  const p = sendSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const viewer = await loadViewer(user.id, profile.role);
  const c = await channelFor(viewer, p.data.channelId);
  if (!c) return { error: 'forbidden' };
  // Thread replies stay open to every reader, even in announcement channels.
  if (!p.data.threadId && !canPostChannel(viewer, c, c.is_member)) return { error: 'readOnly' };

  const sendAt = p.data.sendAt ? new Date(p.data.sendAt) : null;
  if (sendAt && (sendAt.getTime() < Date.now() - 60_000 || sendAt.getTime() > Date.now() + 30 * 86_400_000)) return { error: 'invalidInput' };
  const scheduled = !!sendAt && sendAt.getTime() > Date.now() + 30_000;

  const audience = await channelAudience(c);
  const mentions = [...new Set(p.data.mentions)].filter((id) => id !== user.id && audience.includes(id));

  let message: ChannelMessage | undefined;
  try {
    if (p.data.threadId) {
      const [root] = await sql<{ id: string }[]>`
        select id from chat_channel_messages where id = ${p.data.threadId} and channel_id = ${c.id} and thread_id is null`;
      if (!root) return { error: 'notFound' };
    }
    const [row] = await sql<{ id: string }[]>`
      insert into chat_channel_messages (channel_id, sender_id, body, media_url, media_type, thread_id, mentions, send_at, notified_at)
      values (${c.id}, ${user.id}, ${p.data.body || null}, ${p.data.mediaUrl || null}, ${p.data.mediaUrl ? p.data.mediaType : 'none'},
        ${p.data.threadId ?? null}, ${mentions}, ${scheduled ? sendAt : sql`now()`}, ${scheduled ? null : sql`now()`})
      returning id`;
    [message] = await sql<ChannelMessage[]>`select ${channelMessageCols()} from chat_channel_messages m where m.id = ${row.id}`;
    await sql`
      insert into chat_channel_members (channel_id, user_id, last_read_at) values (${c.id}, ${user.id}, now())
      on conflict (channel_id, user_id) do update set last_read_at = now()`;
  } catch (error) {
    console.error('sendChannelMessageAction failed', error instanceof Error ? error.message : error);
    return { error: 'sendFailed' };
  }

  if (!scheduled) {
    await signal(c.id);
    after(() => notifyMentions({ channelName: c.name, senderName: `${profile.first_name} ${profile.last_name}`, body: p.data.body, mentions }));
  }
  return { message };
}

export async function editChannelMessageAction(id: string, body: string): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  const text = body.trim();
  if (!uuid.safeParse(id).success || !text || text.length > 4000) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ channel_id: string }[]>`
      update chat_channel_messages set body = ${text}, edited_at = now()
      where id = ${id} and sender_id = ${user.id} returning channel_id`;
    if (!row) return { error: 'forbidden' };
    await signal(row.channel_id);
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

export async function deleteChannelMessageAction(id: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  const [m] = await sql<{ channel_id: string; sender_id: string }[]>`select channel_id, sender_id from chat_channel_messages where id = ${id}`;
  if (!m) return { error: 'notFound' };
  if (m.sender_id !== user.id) {
    const c = await channelFor(await loadViewer(user.id, profile.role), m.channel_id);
    if (!c || !canModerateChannel(await loadViewer(user.id, profile.role), c, c.is_admin)) return { error: 'forbidden' };
  }
  try {
    await sql`delete from chat_channel_messages where id = ${id}`;
  } catch {
    return { error: 'deleteFailed' };
  }
  await signal(m.channel_id);
  return {};
}

export async function togglePinChannelMessageAction(id: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  const [m] = await sql<{ channel_id: string; sender_id: string }[]>`select channel_id, sender_id from chat_channel_messages where id = ${id}`;
  if (!m) return { error: 'notFound' };
  const viewer = await loadViewer(user.id, profile.role);
  const c = await channelFor(viewer, m.channel_id);
  if (!c || !canModerateChannel(viewer, c, c.is_admin)) return { error: 'forbidden' };
  try {
    await sql`
      update chat_channel_messages
      set pinned_at = case when pinned_at is null then now() else null end,
          pinned_by = case when pinned_at is null then ${user.id}::uuid else null end
      where id = ${id}`;
  } catch {
    return { error: 'updateFailed' };
  }
  await signal(m.channel_id);
  return {};
}

export async function toggleChannelReactionAction(id: string, emoji: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!uuid.safeParse(id).success || !emoji || emoji.length > 16) return { error: 'invalidInput' };
  const [m] = await sql<{ channel_id: string }[]>`select channel_id from chat_channel_messages where id = ${id}`;
  if (!m || !(await channelFor(await loadViewer(user.id, profile.role), m.channel_id))) return { error: 'forbidden' };
  try {
    await sql.begin(async (tx) => {
      const [row] = await tx<{ reactions: Record<string, string[]> }[]>`select reactions from chat_channel_messages where id = ${id} for update`;
      const r = { ...(row?.reactions ?? {}) };
      const list = r[emoji] ?? [];
      r[emoji] = list.includes(user.id) ? list.filter((x) => x !== user.id) : [...list, user.id];
      if (!r[emoji].length) delete r[emoji];
      await tx`update chat_channel_messages set reactions = ${tx.json(r)} where id = ${id}`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  await signal(m.channel_id);
  return {};
}

/** Cancel one of your own scheduled posts before it goes out. */
export async function cancelScheduledChannelMessageAction(id: string): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from chat_channel_messages where id = ${id} and sender_id = ${user.id} and send_at > now()`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'deleteFailed' };
  }
  return {};
}

/* ------------------------------------------------------------ channels */

const groupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  topic: z.string().trim().max(200).optional().default(''),
  memberIds: z.array(uuid).max(200),
});

/** Anyone may start a group; the creator is its admin. */
export async function createChannelGroupAction(input: z.input<typeof groupSchema>): Promise<Result & { id?: string }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  const p = groupSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const ids = [...new Set([user.id, ...p.data.memberIds])];
  let id: string;
  try {
    id = await sql.begin(async (tx) => {
      const [c] = await tx<{ id: string }[]>`
        insert into chat_channels (name, topic, kind, created_by) values (${p.data.name}, ${p.data.topic || null}, 'group', ${user.id}) returning id`;
      const active = await tx<{ id: string }[]>`select id from profiles where id in ${tx(ids)} and is_active = true`;
      await tx`insert into chat_channel_members ${tx(active.map((a) => ({ channel_id: c.id, user_id: a.id, is_admin: a.id === user.id })))}`;
      return c.id;
    });
  } catch (error) {
    console.error('createChannelGroupAction failed', error instanceof Error ? error.message : error);
    return { error: 'createFailed' };
  }
  after(() => Promise.allSettled(ids.filter((x) => x !== user.id).map((x) => bumpNavBadgeSignal(x))));
  return { id };
}

const editGroupSchema = z.object({
  channelId: uuid,
  name: z.string().trim().min(1).max(60),
  topic: z.string().trim().max(200).optional().default(''),
  memberIds: z.array(uuid).max(200).optional(),
});

/** Rename / re-topic any channel you moderate; for groups also set members. */
export async function updateChannelAction(input: z.input<typeof editGroupSchema>): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  const p = editGroupSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const viewer = await loadViewer(user.id, profile.role);
  const c = await channelFor(viewer, p.data.channelId);
  if (!c || !canModerateChannel(viewer, c, c.is_admin)) return { error: 'forbidden' };
  try {
    await sql.begin(async (tx) => {
      await tx`update chat_channels set name = ${p.data.name}, topic = ${p.data.topic || null} where id = ${c.id}`;
      if (c.kind === 'group' && p.data.memberIds) {
        const keep = [...new Set([user.id, ...p.data.memberIds])];
        await tx`delete from chat_channel_members where channel_id = ${c.id} and user_id not in ${tx(keep)}`;
        const active = await tx<{ id: string }[]>`select id from profiles where id in ${tx(keep)} and is_active = true`;
        if (active.length)
          await tx`insert into chat_channel_members ${tx(active.map((a) => ({ channel_id: c.id, user_id: a.id })))} on conflict do nothing`;
      }
    });
  } catch {
    return { error: 'updateFailed' };
  }
  await signal(c.id);
  return {};
}

export async function leaveChannelAction(channelId: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!uuid.safeParse(channelId).success) return { error: 'invalidInput' };
  const c = await channelFor(await loadViewer(user.id, profile.role), channelId);
  if (!c || c.kind !== 'group') return { error: 'forbidden' };
  try {
    await sql`delete from chat_channel_members where channel_id = ${channelId} and user_id = ${user.id}`;
  } catch {
    return { error: 'updateFailed' };
  }
  await signal(channelId);
  return {};
}

export async function archiveChannelAction(channelId: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!uuid.safeParse(channelId).success) return { error: 'invalidInput' };
  const viewer = await loadViewer(user.id, profile.role);
  const c = await channelFor(viewer, channelId);
  if (!c || c.kind !== 'group' || !canModerateChannel(viewer, c, c.is_admin)) return { error: 'forbidden' };
  try {
    await sql`update chat_channels set archived_at = now() where id = ${channelId}`;
  } catch {
    return { error: 'updateFailed' };
  }
  await signal(channelId);
  return {};
}

export async function setChannelMutedAction(channelId: string, muted: boolean): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!uuid.safeParse(channelId).success) return { error: 'invalidInput' };
  if (!(await channelFor(await loadViewer(user.id, profile.role), channelId))) return { error: 'forbidden' };
  try {
    await sql`
      insert into chat_channel_members (channel_id, user_id, muted) values (${channelId}, ${user.id}, ${muted})
      on conflict (channel_id, user_id) do update set muted = ${muted}`;
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

/* ------------------------------------------------------------ status & search */

const STATUSES = ['lesson', 'meeting', 'busy', 'away'] as const;

export async function setChatStatusAction(status: ChatStatus | null, minutes: number | null): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  if (status !== null && !STATUSES.includes(status)) return { error: 'invalidInput' };
  const mins = minutes === null ? null : Math.max(5, Math.min(24 * 60, Math.round(minutes)));
  try {
    await sql`
      update profiles set chat_status = ${status},
        chat_status_until = ${status && mins ? sql`now() + make_interval(mins => ${mins})` : null}
      where id = ${user.id}`;
  } catch {
    return { error: 'updateFailed' };
  }
  await bumpSignal('board_signals/chat-status').catch(() => {});
  return {};
}

export type ChatStatusMap = Record<string, { status: ChatStatus; until: string | null }>;

export async function getChatStatusesAction(): Promise<ChatStatusMap> {
  const { user } = await getAuthState();
  if (!user) return {};
  const rows = await sql<{ id: string; chat_status: ChatStatus; chat_status_until: string | null }[]>`
    select id, chat_status, chat_status_until from profiles
    where is_active = true and chat_status is not null and (chat_status_until is null or chat_status_until > now())`.catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.id, { status: r.chat_status, until: r.chat_status_until }]));
}

export type ChatSearchHit = {
  kind: 'dm' | 'channel';
  id: string;
  /** DM: the other person's id; channel: the channel id. */
  target: string;
  thread_id: string | null;
  sender_id: string;
  text: string;
  at: string;
  channel_name: string | null;
};

/** Full-text-ish search over the viewer's DMs and readable channels. */
export async function searchChatAction(q: string): Promise<ChatSearchHit[]> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return [];
  const needle = q.trim();
  if (needle.length < 2 || needle.length > 100) return [];
  const like = `%${needle.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const viewer = await loadViewer(user.id, profile.role);
  const readable = (await loadChannelSummaries(viewer)).map((c) => c.id);
  const [dms, posts] = await Promise.all([
    sql<ChatSearchHit[]>`
      select 'dm' as kind, id, case when sender_id = ${user.id} then receiver_id else sender_id end as target,
        null::uuid as thread_id, sender_id, message_text as text, created_at as at, null as channel_name
      from staff_chats
      where (sender_id = ${user.id} or receiver_id = ${user.id}) and message_text ilike ${like}
      order by created_at desc limit 30`,
    readable.length
      ? sql<ChatSearchHit[]>`
          select 'channel' as kind, m.id, m.channel_id as target, m.thread_id, m.sender_id, m.body as text, m.send_at as at, c.name as channel_name
          from chat_channel_messages m join chat_channels c on c.id = m.channel_id
          where m.channel_id in ${sql(readable)} and m.send_at <= now() and m.body ilike ${like}
          order by m.send_at desc limit 30`
      : Promise.resolve([] as ChatSearchHit[]),
  ]);
  return [...dms, ...posts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}

export type ChatFile = { id: string; url: string; type: string; text: string | null; at: string; sender_id: string };

/** Media shared in a DM (with `otherId`) or a channel — the info panel's gallery. */
export async function listSharedFilesAction(scope: { userId?: string; channelId?: string }): Promise<ChatFile[]> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return [];
  if (scope.userId && uuid.safeParse(scope.userId).success) {
    return sql<ChatFile[]>`
      select id, media_url as url, media_type as type, message_text as text, created_at as at, sender_id from staff_chats
      where media_url is not null and ((sender_id = ${user.id} and receiver_id = ${scope.userId}) or (sender_id = ${scope.userId} and receiver_id = ${user.id}))
      order by created_at desc limit 60`;
  }
  if (scope.channelId && uuid.safeParse(scope.channelId).success) {
    if (!(await channelFor(await loadViewer(user.id, profile.role), scope.channelId))) return [];
    return sql<ChatFile[]>`
      select id, media_url as url, media_type as type, body as text, send_at as at, sender_id from chat_channel_messages
      where channel_id = ${scope.channelId} and media_url is not null and send_at <= now()
      order by send_at desc limit 60`;
  }
  return [];
}

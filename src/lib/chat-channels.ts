import 'server-only';
import { sql } from '@/lib/db/client';
import { can, ROLE_DEPT, type Role } from '@/lib/permissions';
import { bumpNavBadgeSignal, bumpSignal } from '@/lib/gcp/firestoreAdmin';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';

export type ChannelKind = 'all' | 'dept' | 'group';

export type ChannelSummary = {
  id: string;
  name: string;
  topic: string | null;
  kind: ChannelKind;
  dept: string | null;
  announce: boolean;
  created_by: string | null;
  member_count: number;
  unread: number;
  mentions: number;
  muted: boolean;
  is_admin: boolean;
  last_at: string | null;
  last_preview: string | null;
  last_sender: string | null;
};

export type ChannelMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  body: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | 'voice' | 'file' | 'none';
  thread_id: string | null;
  mentions: string[];
  reactions: Record<string, string[]>;
  pinned_at: string | null;
  edited_at: string | null;
  send_at: string;
  created_at: string;
  reply_count: number;
  last_reply_at: string | null;
};

export type ChatStatus = 'lesson' | 'meeting' | 'busy' | 'away';

export type Viewer = { id: string; role: string; positions: string[] };

/** Every role the viewer holds (primary + extra positions). */
export async function loadViewer(id: string, role: string): Promise<Viewer> {
  const rows = await sql<{ role: string }[]>`select role::text as role from profile_roles where user_id = ${id}`.catch(() => []);
  return { id, role, positions: rows.map((r) => r.role) };
}

const deptsOf = (v: Viewer) => new Set([v.role, ...v.positions].map((r) => ROLE_DEPT[r as Role]).filter(Boolean));

/** Leadership reads every department channel; a member only their own. */
export function canReadChannel(v: Viewer, c: { kind: string; dept: string | null }, isMember: boolean): boolean {
  if (c.kind === 'all') return true;
  if (c.kind === 'dept') return deptsOf(v).has('top') || (!!c.dept && deptsOf(v).has(c.dept as never));
  return isMember;
}

export function canPostChannel(v: Viewer, c: { kind: string; dept: string | null; announce: boolean }, isMember: boolean): boolean {
  if (!canReadChannel(v, c, isMember)) return false;
  return !c.announce || can(v.role, 'chat.moderate');
}

export function canModerateChannel(v: Viewer, c: { created_by: string | null }, isAdmin: boolean): boolean {
  return can(v.role, 'chat.moderate') || isAdmin || c.created_by === v.id;
}

type ChannelRow = { id: string; name: string; topic: string | null; kind: ChannelKind; dept: string | null; announce: boolean; created_by: string | null };

/** The channel (if the viewer may read it) plus their membership row. */
export async function channelFor(v: Viewer, channelId: string) {
  const [c] = await sql<(ChannelRow & { is_member: boolean; is_admin: boolean })[]>`
    select c.id, c.name, c.topic, c.kind, c.dept, c.announce, c.created_by,
      (m.user_id is not null) as is_member, coalesce(m.is_admin, false) as is_admin
    from chat_channels c
    left join chat_channel_members m on m.channel_id = c.id and m.user_id = ${v.id}
    where c.id = ${channelId} and c.archived_at is null`;
  if (!c || !canReadChannel(v, c, c.is_member)) return null;
  return c;
}

/** Everyone who can read a channel (for @mentions and the members panel). */
export async function channelAudience(c: { id: string; kind: string; dept: string | null }): Promise<string[]> {
  if (c.kind === 'group') {
    const rows = await sql<{ user_id: string }[]>`
      select m.user_id from chat_channel_members m join profiles p on p.id = m.user_id
      where m.channel_id = ${c.id} and p.is_active = true`;
    return rows.map((r) => r.user_id);
  }
  const rows = await sql<{ id: string; role: string; positions: string[] }[]>`
    select p.id, p.role::text as role, coalesce(array_agg(pr.role::text) filter (where pr.role is not null), '{}') as positions
    from profiles p left join profile_roles pr on pr.user_id = p.id
    where p.is_active = true group by p.id`;
  return rows.filter((r) => canReadChannel({ id: r.id, role: r.role, positions: r.positions }, c, false)).map((r) => r.id);
}

/** Sidebar list: readable channels with unread / mention counts and the last post. */
export async function loadChannelSummaries(v: Viewer): Promise<ChannelSummary[]> {
  const rows = await sql<(ChannelSummary & { is_member: boolean })[]>`
    select c.id, c.name, c.topic, c.kind, c.dept, c.announce, c.created_by,
      (m.user_id is not null) as is_member, coalesce(m.muted, false) as muted, coalesce(m.is_admin, false) as is_admin,
      (select count(*)::int from chat_channel_members mm where mm.channel_id = c.id) as member_count,
      (select count(*)::int from chat_channel_messages x
        where x.channel_id = c.id and x.thread_id is null and x.sender_id <> ${v.id}
          and x.send_at <= now() and x.send_at > coalesce(m.last_read_at, now() - interval '3 days')) as unread,
      (select count(*)::int from chat_channel_messages x
        where x.channel_id = c.id and ${v.id} = any(x.mentions)
          and x.send_at <= now() and x.send_at > coalesce(m.last_read_at, now() - interval '3 days')) as mentions,
      l.send_at as last_at, l.body as last_preview, l.sender as last_sender
    from chat_channels c
    left join chat_channel_members m on m.channel_id = c.id and m.user_id = ${v.id}
    left join lateral (
      select x.send_at, coalesce(x.body, case x.media_type when 'image' then '🖼 Rasm' when 'video' then '🎬 Video' when 'voice' then '🎤 Ovozli xabar' else '📎 Fayl' end) as body,
        p.first_name as sender
      from chat_channel_messages x join profiles p on p.id = x.sender_id
      where x.channel_id = c.id and x.thread_id is null and x.send_at <= now()
      order by x.send_at desc limit 1
    ) l on true
    where c.archived_at is null
    order by c.kind = 'all' desc, c.kind = 'dept' desc, l.send_at desc nulls last, c.name`;
  return rows
    .filter((r) => canReadChannel(v, r, r.is_member))
    .map((r) => {
      const { is_member, ...rest } = r;
      void is_member;
      return { ...rest, member_count: r.kind === 'group' ? r.member_count : 0 };
    });
}

export const channelMessageCols = () => sql`
  m.id, m.channel_id, m.sender_id, m.body, m.media_url, m.media_type, m.thread_id, m.mentions, m.reactions,
  m.pinned_at, m.edited_at, m.send_at, m.created_at,
  (select count(*)::int from chat_channel_messages r where r.thread_id = m.id and r.send_at <= now()) as reply_count,
  (select max(r.send_at) from chat_channel_messages r where r.thread_id = m.id and r.send_at <= now()) as last_reply_at`;

/** Telegram + nav badge for each @mentioned person. Also used by the cron
 * when a scheduled post goes out. */
export async function notifyMentions({ channelName, senderName, body, mentions }: { channelName: string; senderName: string; body: string; mentions: string[] }) {
  if (!mentions.length) return;
  const rows = await sql<{ id: string; telegram_id: number | null }[]>`select id, telegram_id from profiles where id in ${sql(mentions)}`;
  const preview = escapeTelegramText(body.replace(/\s+/g, ' ').slice(0, 300));
  await Promise.allSettled(
    rows.flatMap((r) => [
      bumpNavBadgeSignal(r.id),
      r.telegram_id
        ? sendTelegramMessage(r.telegram_id, `🔔 <b>${escapeTelegramText(senderName)}</b> sizni <b>#${escapeTelegramText(channelName)}</b> kanalida eslatdi:\n${preview}`)
        : Promise.resolve(),
    ]),
  );
}

/* ------------------------------------------------------------ cron */

/** Scheduled posts whose time has come: bump the channel and notify
 * mentions once. Called from the 15-minute deadline cron. */
export async function deliverScheduledChannelPosts(): Promise<number> {
  const due = await sql<{ id: string; channel_id: string; channel_name: string; body: string | null; mentions: string[]; sender: string }[]>`
    update chat_channel_messages m set notified_at = now()
    from chat_channels c, profiles p
    where c.id = m.channel_id and p.id = m.sender_id and m.notified_at is null and m.send_at <= now()
    returning m.id, m.channel_id, c.name as channel_name, m.body, m.mentions, p.first_name || ' ' || p.last_name as sender`;
  for (const ch of new Set(due.map((d) => d.channel_id))) await bumpSignal(`board_signals/chat-${ch}`).catch(() => {});
  for (const d of due) await notifyMentions({ channelName: d.channel_name, senderName: d.sender, body: d.body ?? '', mentions: d.mentions });
  return due.length;
}

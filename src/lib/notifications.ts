import 'server-only';
import { sql } from '@/lib/db/client';
import { bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';
import { toPlain } from '@/lib/notify-text';

export { toPlain };

/** Bildirishnomalar markazi (v8-A). Every notification lands here first —
 * the bell reads this table — and Telegram mirrors it (lib/telegram.ts
 * records the kinded sends it delivers; notifyUsers below does both for
 * callers that know the people rather than their chat ids). */

export type NotificationKind = string;

/** A bell row (client-safe shape). */
export type FeedItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  action: boolean;
  createdAt: string;
  unread: boolean;
};
export type NewNotification = {
  kind: NotificationKind;
  /** Telegram-style HTML; the first line becomes the title. */
  text: string;
  href?: string | null;
  /** "Harakat kerak" — the person has to do something (approve, confirm…). */
  action?: boolean;
  ref?: string | null;
};

/** Where a notification of each kind opens when it carries no link. */
export const KIND_HREF: Record<string, string> = {
  task: '/tasks',
  news: '/company-news',
  kpi: '/my-kpi',
  pay: '/profile',
  issue: '/issues',
  stars: '/profile',
  lesson: '/lesson-plans',
  report: '/report',
  chat: '/chat',
  perforce: '/perforce',
};

/** Stores one notification per person and pings their bell. Never throws —
 * a notification failure must not fail the action that caused it. */
export async function recordNotifications(userIds: (string | null | undefined)[], n: NewNotification): Promise<void> {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return;
  try {
    const { title, body } = toPlain(n.text);
    const href = n.href === undefined ? (KIND_HREF[n.kind] ?? null) : n.href;
    await sql`
      insert into notifications (user_id, kind, title, body, href, action, ref)
      select u, ${n.kind}, ${title}, ${body}, ${href}, ${n.action ?? false}, ${n.ref ?? null}
      from unnest(${sql.array(ids)}::uuid[]) as u
      where exists (select 1 from profiles p where p.id = u and p.is_active)`;
    await Promise.all(ids.map((id) => bumpNavBadgeSignal(id).catch(() => {})));
  } catch (error) {
    console.error('recordNotifications failed', error instanceof Error ? error.message : error);
  }
}

/** Same as recordNotifications, addressed by Telegram chat ids (the kinded
 * Telegram helpers know only those). */
export async function recordForChats(chatIds: number[], n: NewNotification): Promise<void> {
  if (!chatIds.length) return;
  try {
    const rows = await sql<{ id: string }[]>`
      select id from profiles where is_active and telegram_id = any(${sql.array(chatIds.map(String))}::bigint[])`;
    await recordNotifications(
      rows.map((r) => r.id),
      n,
    );
  } catch (error) {
    console.error('recordForChats failed', error instanceof Error ? error.message : error);
  }
}

/** Clears an "action needed" item once it has been dealt with (e.g. the
 * reporter confirmed the fix), so the bell doesn't keep asking. */
export async function resolveActionNotifications(ref: string, userIds?: string[]): Promise<void> {
  try {
    await sql`
      update notifications set action = false, read_at = coalesce(read_at, now())
      where ref = ${ref} and action ${userIds?.length ? sql`and user_id = any(${sql.array(userIds)}::uuid[])` : sql``}`;
  } catch (error) {
    console.error('resolveActionNotifications failed', error instanceof Error ? error.message : error);
  }
}

/** Retention: 90 days. Returns rows removed. */
export async function pruneNotifications(): Promise<number> {
  const res = await sql`delete from notifications where created_at < now() - interval '90 days'`;
  await sql`delete from telegram_failures where created_at < now() - interval '30 days'`.catch(() => {});
  return res.count;
}

/** The latest 60 stored notifications plus every unread one older than
 * that (so an unread item never silently falls off the list). */
export async function loadFeed(userId: string): Promise<FeedItem[]> {
  try {
    return await sql<FeedItem[]>`
      select id, kind, title, body, href, action, created_at::text as "createdAt", read_at is null as unread
      from (
        (select * from notifications where user_id = ${userId} order by created_at desc limit 60)
        union
        (select * from notifications where user_id = ${userId} and read_at is null)
      ) n
      order by created_at desc
      limit 200`;
  } catch (error) {
    console.error('loadFeed failed', error instanceof Error ? error.message : error);
    return [];
  }
}


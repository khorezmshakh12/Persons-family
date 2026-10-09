'use server';

import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import type {
  UnreadChatItem,
  UnseenTaskItem,
  UnseenWarningItem,
  UnseenLessonPlanAlertItem,
} from '@/components/app-shell/notification-bell';
import { CAP_ROLES } from '@/lib/permissions';
import { loadFeed, type FeedItem } from '@/lib/notifications';

export type NotificationBellData = {
  unreadChats: UnreadChatItem[];
  /** Bildirishnomalar markazi (v8): the stored notifications, newest first. */
  feed: FeedItem[];
  unseenTasks: UnseenTaskItem[];
  unseenWarnings: UnseenWarningItem[];
  unseenLessonPlanAlerts: UnseenLessonPlanAlertItem[];
};

const EMPTY: NotificationBellData = {
  unreadChats: [],
  feed: [],
  unseenTasks: [],
  unseenWarnings: [],
  unseenLessonPlanAlerts: [],
};

/**
 * Backs both the (app) layout's first server-rendered paint and
 * NotificationBell's own resync-on-open / resync-on-Firestore-signal calls
 * — same "always re-derive the true set from Cloud SQL" reasoning as
 * lib/nav-badges.ts.
 *
 * lesson_plan_compliance_alerts is a CEO oversight report ("which teachers
 * missed their plans this week"), one shared `summary` blob per run with no
 * per-staff column. The old RLS policy made a non-CEO's query come back
 * empty; with RLS gone this had drifted to broadcasting the whole report
 * into every employee's bell. The `role = 'ceo'` guard below restores
 * CEO-only — matching what nav-badges.ts and mark-seen.ts already enforce
 * for the same table.
 */
export async function getNotificationBellDataAction(): Promise<NotificationBellData> {
  const { user } = await getAuthState();
  if (!user) return EMPTY;

  const [unreadChats, feed, unseenTasks, unseenWarnings, unseenLessonPlanAlerts] = await Promise.all([
    sql<UnreadChatItem[]>`
      select id, sender_id as "senderId", message_text as "messageText", created_at as "createdAt"
      from staff_chats where receiver_id = ${user.id} and is_read = false
      order by created_at desc limit 50
    `,
    loadFeed(user.id),
    sql<UnseenTaskItem[]>`
      select id, title, created_at as "createdAt" from tasks
      where assigned_to = ${user.id} and is_seen = false
      order by created_at desc limit 50
    `,
    sql<UnseenWarningItem[]>`
      select id, reason, created_at as "createdAt" from staff_warnings
      where staff_id = ${user.id} and is_seen = false
      order by created_at desc limit 50
    `,
    sql<UnseenLessonPlanAlertItem[]>`
      select id, summary, created_at as "createdAt" from lesson_plan_compliance_alerts
      where is_seen = false
        and exists (select 1 from profiles where id = ${user.id} and role::text = any(${[...CAP_ROLES['academic.viewAll']]}))
      order by created_at desc limit 50
    `,
  ]);

  return { unreadChats, feed, unseenTasks, unseenWarnings, unseenLessonPlanAlerts };
}

/** Marks the given notifications (or all of mine) read. An "action needed"
 * item stays in "Harakat kerak" until the thing itself is done — reading it
 * only clears the unread dot. */
export async function markNotificationsReadAction(ids: string[] | 'all'): Promise<boolean> {
  const { user } = await getAuthState();
  if (!user) return false;
  const list = ids === 'all' ? null : ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
  if (list && !list.length) return false;
  const res = await sql`
    update notifications set read_at = now()
    where user_id = ${user.id} and read_at is null
      ${list ? sql`and id = any(${sql.array(list)}::uuid[])` : sql``}`;
  return res.count > 0;
}

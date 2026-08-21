'use server';

import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import type {
  UnreadChatItem,
  UnseenIssueItem,
  UnseenTaskItem,
  UnseenWarningItem,
  UnseenLessonPlanAlertItem,
} from '@/components/app-shell/notification-bell';

export type NotificationBellData = {
  unreadChats: UnreadChatItem[];
  unseenIssues: UnseenIssueItem[];
  unseenTasks: UnseenTaskItem[];
  unseenWarnings: UnseenWarningItem[];
  unseenLessonPlanAlerts: UnseenLessonPlanAlertItem[];
};

const EMPTY: NotificationBellData = {
  unreadChats: [],
  unseenIssues: [],
  unseenTasks: [],
  unseenWarnings: [],
  unseenLessonPlanAlerts: [],
};

/**
 * Backs both the (app) layout's first server-rendered paint and
 * NotificationBell's own resync-on-open / resync-on-Firestore-signal calls
 * — same "always re-derive the true set from Cloud SQL" reasoning as
 * lib/nav-badges.ts. No `staff_id` filter on lesson_plan_compliance_alerts:
 * that table is CEO-only in practice (only the CEO ever gets rows), the
 * old RLS policy enforced that at the query level and a non-CEO caller
 * just got back an empty list — this preserves that by not filtering at
 * all, matching the original behavior exactly.
 */
export async function getNotificationBellDataAction(): Promise<NotificationBellData> {
  const { user } = await getAuthState();
  if (!user) return EMPTY;

  const [unreadChats, unseenIssues, unseenTasks, unseenWarnings, unseenLessonPlanAlerts] = await Promise.all([
    sql<UnreadChatItem[]>`
      select id, sender_id as "senderId", message_text as "messageText", created_at as "createdAt"
      from staff_chats where receiver_id = ${user.id} and is_read = false
      order by created_at desc limit 50
    `,
    sql<UnseenIssueItem[]>`
      select id, title, created_at as "createdAt" from issues
      where assigned_to = ${user.id} and is_seen = false
      order by created_at desc limit 50
    `,
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
      order by created_at desc limit 50
    `,
  ]);

  return { unreadChats, unseenIssues, unseenTasks, unseenWarnings, unseenLessonPlanAlerts };
}

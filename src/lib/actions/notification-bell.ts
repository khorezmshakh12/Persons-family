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

  const [unreadChats, unseenIssues, unseenTasks, unseenWarnings, unseenLessonPlanAlerts] = await Promise.all([
    sql<UnreadChatItem[]>`
      select id, sender_id as "senderId", message_text as "messageText", created_at as "createdAt"
      from staff_chats where receiver_id = ${user.id} and is_read = false
      order by created_at desc limit 50
    `,
    // Issues is CEO-exclusive (see actions/issues.ts + nav.ts) — a non-CEO
    // can no longer open /issues, so they must not get bell entries for one
    // either, even if a stale row still points `assigned_to` at them.
    sql<UnseenIssueItem[]>`
      select id, title, created_at as "createdAt" from issues
      where assigned_to = ${user.id} and is_seen = false
        and exists (select 1 from profiles where id = ${user.id} and role = 'ceo')
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
        and exists (select 1 from profiles where id = ${user.id} and role = 'ceo')
      order by created_at desc limit 50
    `,
  ]);

  return { unreadChats, unseenIssues, unseenTasks, unseenWarnings, unseenLessonPlanAlerts };
}

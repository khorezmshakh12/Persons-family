import 'server-only';
import { sql } from '@/lib/db/client';
import { bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';
import { can } from '@/lib/permissions';

// Straight ports of the old security-definer RPCs (mark_tasks_seen etc.) —
// `auth.uid()` there is simply `userId` here, since the caller is always
// derived from the session server-side, never client-supplied.
//
// Each returns `true` only when it actually flipped at least one row. That
// return value gates two things downstream:
//   1. the Firestore `nav_badge_signals/{uid}` bump below — a no-op mark-seen
//      must not wake NavBadgesProvider's snapshot listener (which then fires
//      its own server round trip);
//   2. the caller's `router.refresh()` — a no-op mark-seen must not trigger a
//      full RSC refetch.
// Without both guards a `<MarkXSeen>` component that re-runs its effect turns
// into an unbounded POST + RSC storm (it did — the whole dashboard locked up).

export async function markTasksSeen(userId: string): Promise<boolean> {
  const res = await sql`update tasks set is_seen = true where assigned_to = ${userId} and is_seen = false`;
  if (res.count === 0) return false;
  await bumpNavBadgeSignal(userId);
  return true;
}

export async function markIssuesSeen(userId: string): Promise<boolean> {
  const res = await sql`update issues set is_seen = true where assigned_to = ${userId} and is_seen = false`;
  if (res.count === 0) return false;
  await bumpNavBadgeSignal(userId);
  return true;
}

export async function markIssueSeen(userId: string, issueId: string): Promise<boolean> {
  const res = await sql`
    update issues set is_seen = true where id = ${issueId} and assigned_to = ${userId} and is_seen = false
  `;
  if (res.count === 0) return false;
  await bumpNavBadgeSignal(userId);
  return true;
}

export async function markWarningsSeen(userId: string): Promise<boolean> {
  const res = await sql`update staff_warnings set is_seen = true where staff_id = ${userId} and is_seen = false`;
  if (res.count === 0) return false;
  await bumpNavBadgeSignal(userId);
  return true;
}

export async function markCompanyNewsSeen(userId: string): Promise<boolean> {
  const res = await sql`
    insert into company_news_reads (news_id, user_id)
    select id, ${userId} from company_news
    where created_at >= now() - interval '7 days' and deleted_at is null and (publish_at is null or publish_at <= now())
    on conflict (news_id, user_id) do nothing
  `;
  if (res.count === 0) return false;
  await bumpNavBadgeSignal(userId);
  return true;
}

/** Only for whoever receives the alerts (academic.viewAll) — anyone else
 * silently no-ops, the shape the original CEO-only RPC had. */
export async function markLessonPlanAlertsSeen(callerRole: string): Promise<boolean> {
  if (!can(callerRole, 'academic.viewAll')) return false;
  const res = await sql`update lesson_plan_compliance_alerts set is_seen = true where is_seen = false`;
  return res.count > 0;
}

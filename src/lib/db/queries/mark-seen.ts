import 'server-only';
import { sql } from '@/lib/db/client';
import { bumpNavBadgeSignal, markChatMirrorRead } from '@/lib/gcp/firestoreAdmin';

// Straight ports of the old security-definer RPCs (mark_tasks_seen etc.) —
// `auth.uid()` there is simply `userId` here, since the caller is always
// derived from the session server-side, never client-supplied. Each also
// bumps the caller's nav badge signal so NavBadgesProvider re-checks
// immediately instead of waiting for the next full page load.

export async function markTasksSeen(userId: string): Promise<void> {
  await sql`update tasks set is_seen = true where assigned_to = ${userId} and is_seen = false`;
  await bumpNavBadgeSignal(userId);
}

export async function markIssuesSeen(userId: string): Promise<void> {
  await sql`update issues set is_seen = true where assigned_to = ${userId} and is_seen = false`;
  await bumpNavBadgeSignal(userId);
}

export async function markIssueSeen(userId: string, issueId: string): Promise<void> {
  await sql`update issues set is_seen = true where id = ${issueId} and assigned_to = ${userId} and is_seen = false`;
  await bumpNavBadgeSignal(userId);
}

export async function markWarningsSeen(userId: string): Promise<void> {
  await sql`update staff_warnings set is_seen = true where staff_id = ${userId} and is_seen = false`;
  await bumpNavBadgeSignal(userId);
}

export async function markCompanyNewsSeen(userId: string): Promise<void> {
  await sql`
    insert into company_news_reads (news_id, user_id)
    select id, ${userId} from company_news
    where created_at >= now() - interval '7 days'
    on conflict (news_id, user_id) do nothing
  `;
  await bumpNavBadgeSignal(userId);
}

/** CEO-only in the original RPC (a plpgsql role check, not RLS) — a
 * non-CEO caller silently no-ops there, so this mirrors that rather than
 * throwing, to avoid changing behavior for any caller relying on the
 * silent-noop shape. */
export async function markLessonPlanAlertsSeen(callerRole: string): Promise<void> {
  if (callerRole !== 'ceo') return;
  await sql`update lesson_plan_compliance_alerts set is_seen = true where is_seen = false`;
}

export async function markConversationRead(userId: string, otherUserId: string): Promise<void> {
  await sql`
    update staff_chats set is_read = true
    where receiver_id = ${userId} and sender_id = ${otherUserId} and is_read = false
  `;
  // Flips isRead on the mirrored Firestore docs too, so the sender's own
  // open tab sees the read-receipt tick live instead of only on their next
  // full resync.
  await markChatMirrorRead(userId, otherUserId);
  await bumpNavBadgeSignal(userId);
}

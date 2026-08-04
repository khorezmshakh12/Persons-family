import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { allowedAssigneeRoles } from '@/lib/issue-roles';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';
import { IssuesBoard } from '@/components/issues/issues-board';
import { MarkIssuesSeen } from '@/components/issues/mark-issues-seen';
import type { Issue } from '@/components/issues/issue-card';

export const dynamic = 'force-dynamic';

// Signed URLs are re-minted on every page load rather than stored — a
// voice note is viewed occasionally from the board, not streamed live like
// chat media, so there's no reason to bake in a long-lived credential.
const VOICE_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour, plenty for one page view

export default async function IssuesPage() {
  const t = await getTranslations('issues');
  const { user, profile } = await getAuthState();
  const supabase = await createClient();
  const isCeo = profile!.role === 'ceo' || profile!.role === 'it_developer';
  const isAdminManager = profile!.role === 'admin_manager';

  const { data: issuesData } = await supabase
    .from('issues')
    .select(
      'id, title, description, status, created_at, created_by, assigned_to, resolved_at, voice_url, reporter:profiles!issues_created_by_fkey(first_name, last_name), assignee:profiles!issues_assigned_to_fkey(first_name, last_name)',
    )
    .order('created_at', { ascending: false });

  // Auto-hide (not delete): a "done" card older than a week just clutters
  // the board, but the row itself is left alone — no destructive cleanup.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const visibleIssues = (issuesData ?? []).filter((issue) => {
    if (issue.status !== 'done' || !issue.resolved_at) return true;
    return Date.now() - new Date(issue.resolved_at).getTime() < SEVEN_DAYS_MS;
  });

  const issues = await Promise.all(
    visibleIssues.map(async (issue) => {
      // The CEO can always change status; an Administrative Manager only
      // for an issue currently assigned to them (mirrors the server action
      // and the DB trigger exactly — see updateIssueStatusAction).
      const canChangeStatus = isCeo || (isAdminManager && issue.assigned_to === user!.id);
      if (!issue.voice_url) return { ...issue, voiceSignedUrl: null, canChangeStatus };
      // Row access is already scoped by the issues_select RLS policy above;
      // this only needs the admin client because storage RLS itself is
      // missing on the new Frankfurt project.
      const { data: signed } = await createAdminClient()
        .storage.from('issue-voice-notes')
        .createSignedUrl(issue.voice_url, VOICE_URL_EXPIRY_SECONDS);
      return { ...issue, voiceSignedUrl: signed?.signedUrl ?? null, canChangeStatus };
    }),
  );

  // Chain of command: a non-admin can only escalate to an Administrative
  // Manager, except teachers, who additionally get the CEO as an option
  // (their choice — day-to-day issues go to the Manager, anything more
  // critical can go straight to the CEO). Only the CEO can delegate to any
  // active staff member; an Administrative Manager is scoped like anyone
  // else now (see allowedAssigneeRoles).
  let assigneeQuery = supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('is_active', true)
    .order('first_name', { ascending: true });
  if (!isCeo) assigneeQuery = assigneeQuery.in('role', allowedAssigneeRoles(profile!.role));
  const { data: assignees } = await assigneeQuery;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <MarkIssuesSeen />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        <CreateIssueDialog assignees={assignees ?? []} />
      </div>
      <IssuesBoard issues={issues as unknown as Issue[]} isAdmin={isCeo} currentUserId={user!.id} />
    </div>
  );
}

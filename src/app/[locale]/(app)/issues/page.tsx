import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';
import { IssuesBoard } from '@/components/issues/issues-board';
import type { Issue } from '@/components/issues/issue-card';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const t = await getTranslations('issues');
  const { profile } = await getAuthState();
  const supabase = await createClient();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';

  const { data: issues } = await supabase
    .from('issues')
    .select(
      'id, title, description, status, created_at, reporter:profiles!issues_created_by_fkey(first_name, last_name), assignee:profiles!issues_assigned_to_fkey(first_name, last_name)',
    )
    .order('created_at', { ascending: false });

  // Strict chain of command: a non-admin can only escalate to an
  // Administrative Manager, so that's the only pool they're offered.
  // CEO/Administrative Manager can delegate to any active staff member.
  let assigneeQuery = supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('is_active', true)
    .order('first_name', { ascending: true });
  assigneeQuery = isAdmin ? assigneeQuery : assigneeQuery.eq('role', 'admin_manager');
  const { data: assignees } = await assigneeQuery;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        <CreateIssueDialog assignees={assignees ?? []} />
      </div>
      <IssuesBoard issues={(issues as unknown as Issue[]) ?? []} isAdmin={isAdmin} />
    </div>
  );
}

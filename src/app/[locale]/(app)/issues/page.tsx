import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { getVisibleIssuesAction } from '@/lib/actions/issues';
import { allowedAssigneeRoles } from '@/lib/issue-roles';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';
import { IssuesBoard } from '@/components/issues/issues-board';
import { MarkIssuesSeen } from '@/components/issues/mark-issues-seen';
import type { Issue } from '@/components/issues/issue-card';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const t = await getTranslations('issues');
  const { user, profile } = await getAuthState();
  const isCeo = profile!.role === 'ceo';
  const isAdminManager = profile!.role === 'admin_manager';

  // Chain of command: a non-admin can only escalate to an Administrative
  // Manager, except teachers, who additionally get the CEO as an option
  // (their choice — day-to-day issues go to the Manager, anything more
  // critical can go straight to the CEO). Only the CEO can delegate to any
  // active staff member; an Administrative Manager is scoped like anyone
  // else now (see allowedAssigneeRoles). Run alongside the issues fetch
  // below — the two are independent of each other.
  const [issues, assignees] = await Promise.all([
    getVisibleIssuesAction(),
    isCeo
      ? sql<{ id: string; first_name: string; last_name: string }[]>`
          select id, first_name, last_name from profiles
          where is_active = true order by first_name asc
        `
      : sql<{ id: string; first_name: string; last_name: string }[]>`
          select id, first_name, last_name from profiles
          where is_active = true and role in ${sql(allowedAssigneeRoles(profile!.role))}
          order by first_name asc
        `,
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <MarkIssuesSeen />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        <CreateIssueDialog assignees={assignees} />
      </div>
      <IssuesBoard
        issues={issues as unknown as Issue[]}
        isAdmin={isCeo}
        isAdminManager={isAdminManager}
        currentUserId={user!.id}
      />
    </div>
  );
}

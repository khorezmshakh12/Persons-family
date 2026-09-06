import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { getVisibleIssuesAction } from '@/lib/actions/issues';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';
import { IssuesBoard } from '@/components/issues/issues-board';
import { MarkIssuesSeen } from '@/components/issues/mark-issues-seen';
import type { Issue } from '@/components/issues/issue-card';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const t = await getTranslations('issues');
  const { profile } = await getAuthState();
  // Issues is CEO-exclusive: no other role can report, view, or manage an
  // issue any more. notFound() rather than a redirect so the module is
  // invisible (mirrors the nav gate); every issues.ts Server Action
  // re-checks CEO itself, since this guard only covers page rendering.
  if (profile!.role !== 'ceo') notFound();

  // The viewer is always the CEO here, so the "Assign to" dropdown offers
  // every active staff member — the old chain-of-command scoping
  // (allowedAssigneeRoles) only existed for non-CEO reporters and is gone.
  // Run alongside the issues fetch below — the two are independent.
  const [issues, assignees] = await Promise.all([
    getVisibleIssuesAction(),
    sql<{ id: string; first_name: string; last_name: string }[]>`
      select id, first_name, last_name from profiles
      where is_active = true order by first_name asc
    `,
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <MarkIssuesSeen />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        <CreateIssueDialog assignees={assignees} />
      </div>
      <IssuesBoard issues={issues as unknown as Issue[]} />
    </div>
  );
}

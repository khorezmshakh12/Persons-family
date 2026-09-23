import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { getMonthlyIssueArchiveAction, getVisibleIssuesAction } from '@/lib/actions/issues';
import { getIssueStatsAction } from '@/lib/actions/issue-stats';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';
import { IssuesBoard } from '@/components/issues/issues-board';
import { IssuesStats } from '@/components/issues/issues-stats';
import { MonthlyIssueArchive } from '@/components/issues/monthly-issue-archive';
import { MarkIssuesSeen } from '@/components/issues/mark-issues-seen';
import type { Issue } from '@/components/issues/issue-card';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const t = await getTranslations('issues');
  const { profile } = await getAuthState();
  const isCeo = profile!.role === 'ceo';

  // Every staff member reaches this page: a non-CEO gets a read-only view of
  // just the issues they raised (getVisibleIssuesAction scopes the query to
  // created_by = self) plus the "new issue" form, which auto-routes to the
  // CEO — so no assignee picker and no stats panel for them. The CEO gets
  // the full managed board, the assignee list of every active staff member,
  // and the resolution-stats panel. Every issues.ts Server Action re-checks
  // its own gate (create/report is open to all; status/edit/delete stay
  // CEO-only), so this page-level split is presentation, not the boundary.
  // The archive under the board carries every *past* Tashkent month that
  // resolved an issue, scoped exactly like getVisibleIssuesAction (CEO: all;
  // anyone else: only the issues they raised).
  const [issues, assignees, issueStats, issueArchive] = await Promise.all([
    getVisibleIssuesAction(),
    isCeo
      ? sql<{ id: string; first_name: string; last_name: string }[]>`
          select id, first_name, last_name from profiles
          where is_active = true order by first_name asc
        `
      : Promise.resolve([] as { id: string; first_name: string; last_name: string }[]),
    isCeo
      ? getIssueStatsAction()
      : Promise.resolve({ data: undefined } as Awaited<ReturnType<typeof getIssueStatsAction>>),
    getMonthlyIssueArchiveAction(),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <MarkIssuesSeen />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        <CreateIssueDialog assignees={assignees} canAssign={isCeo} />
      </div>
      {isCeo && <IssuesStats stats={issueStats.data ?? null} />}
      <IssuesBoard issues={issues as unknown as Issue[]} readOnly={!isCeo} />
      <MonthlyIssueArchive months={issueArchive} />
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { getMonthlyIssueArchiveAction, getVisibleIssuesAction } from '@/lib/actions/issues';
import { getIssueStatsAction } from '@/lib/actions/issue-stats';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';
import { AiTriageButton } from '@/components/issues/ai-triage-button';
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <MarkIssuesSeen />
      <div className="flex flex-wrap items-center justify-between gap-3 relative overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isCeo && <AiTriageButton />}
          <CreateIssueDialog assignees={assignees} canAssign={isCeo} />
        </div>
      </div>
      {isCeo && <IssuesStats stats={issueStats.data ?? null} />}
      <IssuesBoard issues={issues as unknown as Issue[]} readOnly={!isCeo} />
      <MonthlyIssueArchive months={issueArchive} />
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { IssueCard, type Issue } from './issue-card';

const COLUMNS: Issue['status'][] = ['open', 'in_progress', 'done'];

export async function IssuesBoard({ issues, isAdmin }: { issues: Issue[]; isAdmin: boolean }) {
  const t = await getTranslations('issues');

  if (issues.length === 0) {
    return <p className="text-sm text-white/70">{t('noIssues')}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((status) => {
        const columnIssues = issues.filter((issue) => issue.status === status);
        return (
          <div key={status} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-white">
              {t(`columns.${status}`)} ({columnIssues.length})
            </h2>
            <div className="flex flex-col gap-3">
              {columnIssues.length === 0 ? (
                <p className="text-sm text-white/60">{t('noIssuesInColumn')}</p>
              ) : (
                columnIssues.map((issue) => <IssueCard key={issue.id} issue={issue} isAdmin={isAdmin} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

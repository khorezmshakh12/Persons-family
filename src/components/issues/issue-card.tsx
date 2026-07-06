import { getFormatter, getTranslations } from 'next-intl/server';
import { IssueStatusControl } from './issue-status-control';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type Issue = {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  created_at: string;
  reporter: { first_name: string; last_name: string } | null;
  assignee: { first_name: string; last_name: string } | null;
};

export async function IssueCard({ issue, isAdmin }: { issue: Issue; isAdmin: boolean }) {
  const t = await getTranslations('issues');
  const format = await getFormatter();

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-3 p-6')}>
      <span className="font-medium">{issue.title}</span>
      {issue.description && <p className="text-sm text-white/70">{issue.description}</p>}
      <div className="flex flex-col gap-1 text-xs text-white/60">
        {isAdmin && issue.reporter && (
          <span>
            {t('table.reporter')}: {issue.reporter.first_name} {issue.reporter.last_name}
          </span>
        )}
        <span>
          {issue.assignee
            ? `${t('assignee')}: ${issue.assignee.first_name} ${issue.assignee.last_name}`
            : t('noAssignee')}
        </span>
        <span>{format.dateTime(new Date(issue.created_at), { dateStyle: 'medium' })}</span>
      </div>
      <IssueStatusControl issueId={issue.id} status={issue.status} readOnly={!isAdmin} />
    </div>
  );
}

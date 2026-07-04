import { getTranslations, getFormatter } from 'next-intl/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IssueStatusControl } from './issue-status-control';

type Issue = {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  created_at: string;
  reporter: { first_name: string; last_name: string } | null;
};

export async function IssuesTable({ issues, isAdmin }: { issues: Issue[]; isAdmin: boolean }) {
  const t = await getTranslations('issues');
  const format = await getFormatter();

  if (issues.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('noIssues')}</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {isAdmin && <TableHead>{t('table.reporter')}</TableHead>}
            <TableHead>{t('table.title')}</TableHead>
            <TableHead>{t('table.created')}</TableHead>
            <TableHead>{t('table.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id}>
              {isAdmin && (
                <TableCell>
                  {issue.reporter ? `${issue.reporter.first_name} ${issue.reporter.last_name}` : '—'}
                </TableCell>
              )}
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{issue.title}</span>
                  {issue.description && (
                    <span className="text-muted-foreground text-sm">{issue.description}</span>
                  )}
                </div>
              </TableCell>
              <TableCell>{format.dateTime(new Date(issue.created_at), { dateStyle: 'medium' })}</TableCell>
              <TableCell>
                <IssueStatusControl issueId={issue.id} status={issue.status} readOnly={!isAdmin} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

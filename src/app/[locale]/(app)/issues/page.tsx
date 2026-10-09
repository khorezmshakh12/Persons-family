import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { getIssuesCenterAction, getMonthlyIssueArchiveAction } from '@/lib/actions/issues';
import { getIssueStatsAction } from '@/lib/actions/issue-stats';
import { IssuesCenterView } from '@/components/issues/issues-center';
import { MarkIssuesSeen } from '@/components/issues/mark-issues-seen';
import { can } from '@/lib/permissions';
import { allowedTaskAssigneeRoles } from '@/lib/task-roles';
import type { StaffRole } from '@/lib/nav';

export const dynamic = 'force-dynamic';

/** Murojaatlar markazi (v8-A, 2026-10-10). Everyone raises and follows
 * their own; managers (issues.manage) run the queue; an assignee works the
 * ones given to them. Every action re-checks its own gate. */
export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ id?: string; new?: string }> }) {
  const { profile } = await getAuthState();
  if (!profile) notFound();
  const manager = can(profile.role, 'issues.manage');
  const sp = await searchParams;
  const taskRoles = allowedTaskAssigneeRoles(profile.role as StaffRole);

  const [center, archive, stats, people] = await Promise.all([
    getIssuesCenterAction(),
    getMonthlyIssueArchiveAction(),
    manager ? getIssueStatsAction() : Promise.resolve({ data: undefined }),
    sql<{ id: string; first_name: string | null; last_name: string | null; role: string }[]>`
      select id, first_name, last_name, role::text as role from profiles where is_active order by first_name, last_name`,
  ]);
  if (!center) notFound();

  const named = people.map((p) => ({ id: p.id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || '—', role: p.role }));
  return (
    <>
      <MarkIssuesSeen />
      <IssuesCenterView
        initial={center}
        archive={archive}
        stats={stats.data ?? null}
        // Managers pick any active person as the assignee.
        assignees={manager ? named.map(({ id, name }) => ({ id, name })) : []}
        // Who this viewer may give a task to (themselves always).
        taskPeople={named.filter((p) => p.id === profile.id || (taskRoles as string[]).includes(p.role)).map(({ id, name }) => ({ id, name }))}
        focusId={sp.id ?? null}
        openNew={sp.new === '1'}
      />
    </>
  );
}

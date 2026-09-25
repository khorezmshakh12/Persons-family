import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { STRATEGY_ROLES } from '@/lib/nav';
import { tashkentDayKey } from '@/lib/time';
import { withSignedAvatars } from '@/lib/strategy-people';
import { PerforceWorkspace, type PfData } from '@/components/strategy/perforce-workspace';

export const dynamic = 'force-dynamic';

export default async function PerforcePage() {
  const { profile } = await getAuthState();
  if (!profile || !STRATEGY_ROLES.includes(profile.role)) notFound();

  const [spaces, stasks, tasks, issues, people, milestones, tests, crs, crComments, crVotes, goals, risks] = await Promise.all([
    sql<PfData['spaces']>`select id, name, color, start_date, end_date, budget from strategy_spaces order by sort_order, created_at`,
    sql<PfData['stasks']>`
      select id, space_id, title, description, workstream, assignee_id, start_date, end_date, status, priority, progress,
             roadmap_id, roadmap_node, created_at, done_at
      from strategy_tasks`,
    sql<PfData['tasks']>`
      select id, title, status, assigned_to, created_at, deadline, submitted_at, completed_at
      from tasks
      where created_at >= now() - interval '180 days' or status <> 'done'`,
    sql<PfData['issues']>`
      select id, title, status, assigned_to, created_at, resolved_at
      from issues
      where created_at >= now() - interval '180 days' or status <> 'done'`,
    sql<PfData['people']>`
      select id, first_name, last_name, avatar_url, role::text as role from profiles where is_active = true`,
    sql<PfData['milestones']>`select id, space_id, title, date from strategy_milestones order by date`,
    sql<PfData['tests']>`select id, space_id, stask_id, title, result, issue_id, run_at from pf_test_cases order by created_at`,
    sql<PfData['crs']>`
      select id, space_id, stask_id, title, description, status, author_id, decided_by, decided_at, created_at
      from (select * from pf_change_requests order by created_at desc limit 200) c order by created_at desc`,
    sql<PfData['crComments']>`
      select c.id, c.cr_id, c.author_id, c.body, c.created_at
      from pf_cr_comments c join (select id from pf_change_requests order by created_at desc limit 200) r on r.id = c.cr_id
      order by c.created_at`,
    sql<PfData['crVotes']>`select cr_id, voter_id from pf_cr_votes`,
    sql<PfData['goals']>`select sprint_no, goal from pf_sprint_goals`,
    sql<PfData['risks']>`
      select id, space_id, title, category, likelihood, impact, treatment, mitigation, owner_id,
             to_char(review_date, 'YYYY-MM-DD') as review_date, status, postmortem, updated_at
      from pf_risks order by created_at desc limit 300`,
  ]);

  return (
    <PerforceWorkspace
      data={{
        spaces: [...spaces],
        stasks: [...stasks],
        tasks: [...tasks],
        issues: [...issues],
        people: await withSignedAvatars([...people]),
        milestones: [...milestones],
        tests: [...tests],
        crs: [...crs],
        crComments: [...crComments],
        crVotes: [...crVotes],
        goals: [...goals],
        risks: [...risks],
      }}
      today={tashkentDayKey()}
    />
  );
}

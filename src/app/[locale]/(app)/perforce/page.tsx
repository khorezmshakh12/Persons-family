import { notFound } from 'next/navigation';
import { can, canSeeFor } from '@/lib/permissions';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { tashkentDayKey } from '@/lib/time';
import { withSignedAvatars } from '@/lib/strategy-people';
import { DEFAULT_WEIGHTS, type LoadWeights } from '@/lib/perforce-load';
import { PerforceHub, type PfData } from '@/components/strategy/perforce-hub';

export const dynamic = 'force-dynamic';

/** Persons Perforce — "Loyihalar nazorati markazi" (v2, 2026-10-09).
 * Strategy plans the projects; this page controls their execution. */
export default async function PerforcePage() {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'perforce')) notFound();
  const held = profile.roles ?? [profile.role];
  const isLead = held.some((r) => r === 'ceo' || r === 'coo');
  // Project budgets are financial figures — CEO only (others get none).
  const seesBudget = can(profile.role, 'finance.viewAll');

  const [spaces, stasks, tasks, issues, people, milestones, risks, statuses, decisions, comments, votes, weights, core] = await Promise.all([
    seesBudget
      ? sql<PfData['spaces']>`select id, name, color, start_date, end_date, owner_id, budget from strategy_spaces order by sort_order, created_at`
      : sql<PfData['spaces']>`select id, name, color, start_date, end_date, owner_id, '[]'::jsonb as budget from strategy_spaces order by sort_order, created_at`,
    sql<PfData['stasks']>`
      select id, space_id, title, description, workstream, assignee_id, start_date, end_date, status, priority, progress,
             roadmap_id, roadmap_node, created_at, done_at
      from strategy_tasks`,
    sql<PfData['tasks']>`select id, title, status, assigned_to, deadline from tasks where status <> 'done'`,
    sql<PfData['issues']>`select id, title, status, assigned_to, created_at from issues where status <> 'done'`,
    sql<PfData['people']>`select id, first_name, last_name, avatar_url, role::text as role from profiles where is_active = true order by first_name`,
    sql<PfData['milestones']>`select id, space_id, title, date::text as date from strategy_milestones order by date`,
    sql<PfData['risks']>`
      select id, space_id, title, category, likelihood, impact, treatment, mitigation, owner_id,
             to_char(review_date, 'YYYY-MM-DD') as review_date, status, postmortem, updated_at
      from pf_risks order by created_at desc limit 300`,
    sql<PfData['statuses']>`
      select id, space_id, rag, suggested, override_note, summary, next_steps, author_id, created_at::text as created_at, updated_at::text as updated_at
      from pf_status_updates order by created_at desc limit 400`,
    sql<PfData['decisions']>`
      select id, space_id, stask_id, kind, title, description, current_value, proposed_value, impact, status,
             author_id, decided_by, decided_at::text as decided_at, decision_note, applied_at::text as applied_at, created_at::text as created_at
      from (select * from pf_change_requests order by created_at desc limit 300) c order by created_at desc`,
    sql<PfData['comments']>`
      select c.id, c.cr_id, c.author_id, c.body, c.created_at::text as created_at
      from pf_cr_comments c join (select id from pf_change_requests order by created_at desc limit 300) r on r.id = c.cr_id
      order by c.created_at`,
    sql<PfData['votes']>`select cr_id, voter_id from pf_cr_votes`,
    sql<{ value: Partial<LoadWeights> }[]>`select value from pf_settings where key = 'load_weights'`,
    sql<{ leave: unknown; keys: Record<string, string> | null }[]>`select data->'leave' as leave, data->'keys' as keys from core_state where id = 1`,
  ]);

  // Approved / pending leave from Core's shared state (keyed by Core's short staff keys).
  const keyToId = Object.fromEntries(Object.entries(core[0]?.keys ?? {}).map(([id, k]) => [k, id]));
  const rawLeave = Array.isArray(core[0]?.leave) ? (core[0].leave as { k: string; from: number; to: number; st?: string }[]) : [];
  const leave = rawLeave
    .filter((l) => l.st !== 'no' && typeof l.from === 'number' && typeof l.to === 'number' && keyToId[l.k])
    .map((l) => ({ personId: keyToId[l.k], from: tashkentDayKey(new Date(l.from)), to: tashkentDayKey(new Date(l.to)) }));

  return (
    <PerforceHub
      viewerId={profile.id}
      isLead={isLead}
      seesBudget={seesBudget}
      today={tashkentDayKey()}
      data={{
        spaces: [...spaces],
        stasks: [...stasks],
        tasks: [...tasks],
        issues: [...issues],
        people: await withSignedAvatars([...people]),
        milestones: [...milestones],
        risks: [...risks],
        statuses: [...statuses],
        decisions: [...decisions],
        comments: [...comments],
        votes: [...votes],
        weights: { ...DEFAULT_WEIGHTS, ...(weights[0]?.value ?? {}) },
        leave,
      }}
    />
  );
}

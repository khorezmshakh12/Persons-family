import 'server-only';
import { sql } from '@/lib/db/client';
import type { NodeStatus } from '@/lib/strategy';
import {
  EMPTY_MIND,
  EMPTY_ROADMAP,
  countNodes,
  stagePhases,
  type GrowthMind,
  type GrowthPerson,
  type GrowthPlan,
  type GrowthRoadmap,
  type StageReview,
} from '@/lib/hr-growth';

type Row = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  roadmap: GrowthRoadmap | null;
  node_status: Record<string, NodeStatus> | null;
  stage_state: Record<string, StageReview> | null;
  mind: GrowthMind | null;
  submitted_at: Date | null;
};

const fullName = (r: { first_name: string | null; last_name: string | null }) =>
  `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Nomsiz';

function toPlan(r: Row): GrowthPlan {
  return {
    userId: r.user_id,
    name: fullName(r),
    role: r.role,
    roadmap: r.roadmap?.sections ? r.roadmap : EMPTY_ROADMAP,
    nodeStatus: r.node_status ?? {},
    stageState: r.stage_state ?? {},
    mind: r.mind?.ch ? r.mind : EMPTY_MIND,
    submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
  };
}

/**
 * One person's plan. `forCeo`: a roadmap that was never submitted is hidden
 * (empty) — only the mind map is always visible to the CEO.
 */
export async function loadGrowthPlan(userId: string, forCeo = false): Promise<GrowthPlan | null> {
  const [r] = await sql<Row[]>`
    select p.id as user_id, p.first_name, p.last_name, p.role::text as role,
      g.roadmap, g.node_status, g.stage_state, g.mind, g.submitted_at
    from profiles p left join hr_growth g on g.user_id = p.id
    where p.id = ${userId}
  `.catch(() => []);
  if (!r) return null;
  const plan = toPlan(r);
  if (forCeo && !plan.submittedAt) return { ...plan, roadmap: EMPTY_ROADMAP, nodeStatus: {}, stageState: {} };
  return plan;
}

/** CEO's team list: every active employee, roadmap numbers only once submitted. */
export async function loadGrowthTeam(): Promise<GrowthPerson[]> {
  const rows = await sql<Row[]>`
    select p.id as user_id, p.first_name, p.last_name, p.role::text as role,
      g.roadmap, g.node_status, g.stage_state, g.mind, g.submitted_at
    from profiles p left join hr_growth g on g.user_id = p.id
    where p.is_active = true
    order by p.first_name, p.last_name
  `.catch(() => []);
  return rows.map((r) => {
    const plan = toPlan(r);
    const submitted = !!plan.submittedAt;
    const phases = Object.values(stagePhases(plan.roadmap, plan.stageState));
    return {
      userId: plan.userId,
      name: plan.name,
      role: plan.role,
      submitted,
      stages: submitted ? plan.roadmap.sections.length : 0,
      approved: submitted ? phases.filter((p) => p === 'approved').length : 0,
      waiting: submitted ? phases.filter((p) => p === 'waiting').length : 0,
      mindNodes: countNodes(plan.mind.ch),
    };
  });
}

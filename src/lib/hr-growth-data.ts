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
  sent_roadmap: GrowthRoadmap | null;
  sent_mind: GrowthMind | null;
  /** db/client.ts returns timestamptz as a string, not a Date. */
  sent_at: string | Date | null;
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
    sentRoadmap: r.sent_roadmap?.sections ? r.sent_roadmap : EMPTY_ROADMAP,
    sentMind: r.sent_mind?.ch ? r.sent_mind : EMPTY_MIND,
    submittedAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
  };
}

/**
 * One person's plan. `forCeo` (CEO / HR looking at someone else's): only the
 * copy sent with «CEO'ga yuborish» — the draft stays private.
 */
export async function loadGrowthPlan(userId: string, forCeo = false): Promise<GrowthPlan | null> {
  const [r] = await sql<Row[]>`
    select p.id as user_id, p.first_name, p.last_name, p.role::text as role,
      g.roadmap, g.node_status, g.stage_state, g.mind, g.sent_roadmap, g.sent_mind, g.sent_at
    from profiles p left join hr_growth g on g.user_id = p.id
    where p.id = ${userId}
  `.catch(() => []);
  if (!r) return null;
  const plan = toPlan(r);
  if (forCeo) return { ...plan, roadmap: plan.sentRoadmap, mind: plan.sentMind };
  return plan;
}

/** CEO / HR team list: every active employee, numbers from the sent copy only. */
export async function loadGrowthTeam(): Promise<GrowthPerson[]> {
  const rows = await sql<Row[]>`
    select p.id as user_id, p.first_name, p.last_name, p.role::text as role,
      g.roadmap, g.node_status, g.stage_state, g.mind, g.sent_roadmap, g.sent_mind, g.sent_at
    from profiles p left join hr_growth g on g.user_id = p.id
    where p.is_active = true
    order by p.first_name, p.last_name
  `.catch(() => []);
  return rows.map((r) => {
    const plan = toPlan(r);
    const submitted = !!plan.submittedAt;
    const phases = Object.values(stagePhases(plan.sentRoadmap, plan.stageState));
    return {
      userId: plan.userId,
      name: plan.name,
      role: plan.role,
      submitted,
      stages: submitted ? plan.sentRoadmap.sections.length : 0,
      approved: submitted ? phases.filter((p) => p === 'approved').length : 0,
      waiting: submitted ? phases.filter((p) => p === 'waiting').length : 0,
      mindNodes: countNodes(plan.sentMind.ch),
    };
  });
}

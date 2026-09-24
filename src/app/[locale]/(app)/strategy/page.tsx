import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { STRATEGY_ROLES } from '@/lib/nav';
import { tashkentDayKey } from '@/lib/time';
import type {
  StrategyMilestone,
  StrategyPerson,
  StrategyRoadmap,
  StrategySpace,
  StrategyTask,
} from '@/lib/strategy';
import { StrategyWorkspace } from '@/components/strategy/strategy-workspace';

export const dynamic = 'force-dynamic';

export default async function StrategyPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const { profile } = await getAuthState();
  if (!profile || !STRATEGY_ROLES.includes(profile.role)) notFound();

  const [spaces, roadmaps, people] = await Promise.all([
    sql<StrategySpace[]>`
      select id, name, subtitle, color, start_date, end_date, mind, budget
      from strategy_spaces order by sort_order, created_at`,
    sql<StrategyRoadmap[]>`
      select id, key, name, subtitle, icon, sections, node_status
      from strategy_roadmaps order by sort_order, created_at`,
    sql<StrategyPerson[]>`
      select id, first_name, last_name, avatar_url, role::text as role
      from profiles where is_active = true order by first_name, last_name`,
  ]);

  const wanted = (await searchParams)?.space;
  const space = spaces.find((s) => s.id === wanted) ?? spaces[0] ?? null;

  const [tasks, milestones] = space
    ? await Promise.all([
        sql<StrategyTask[]>`
          select id, space_id, title, description, workstream, assignee_id, start_date, end_date,
                 status, priority, progress, roadmap_id, roadmap_node
          from strategy_tasks where space_id = ${space.id} order by start_date, created_at`,
        sql<StrategyMilestone[]>`
          select id, title, date from strategy_milestones where space_id = ${space.id} order by date`,
      ])
    : [[], []];

  return (
    <StrategyWorkspace
      key={space?.id ?? 'none'}
      spaces={spaces.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
      space={space}
      tasks={tasks}
      milestones={milestones}
      roadmaps={roadmaps}
      people={people}
      today={tashkentDayKey()}
    />
  );
}

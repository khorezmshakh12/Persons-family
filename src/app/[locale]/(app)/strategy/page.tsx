import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';

import { tashkentDayKey } from '@/lib/time';
import { withSignedAvatars } from '@/lib/strategy-people';
import type {
  StrategyMilestone,
  StrategyPerson,
  StrategyRoadmap,
  StrategySpace,
  StrategyTask,
} from '@/lib/strategy';
import { StrategyWorkspace } from '@/components/strategy/strategy-workspace';
import { loadBooks } from '@/lib/accounting-data';
import { loadFinInputs } from '@/lib/strategy-finance-data';
import { can, canSeeFor } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export default async function StrategyPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'strategy')) notFound();
  const finance = can(profile.role, 'finance.viewAll');

  const [spaces, roadmaps, people, books, fin] = await Promise.all([
    sql<StrategySpace[]>`
      select id, name, subtitle, color, start_date, end_date, mind, budget
      from strategy_spaces order by sort_order, created_at`,
    sql<StrategyRoadmap[]>`
      select id, key, name, subtitle, icon, sections, node_status, node_links
      from strategy_roadmaps order by sort_order, created_at`,
    sql<StrategyPerson[]>`
      select id, first_name, last_name, avatar_url, role::text as role
      from profiles where is_active = true order by first_name, last_name`,
    // Financial figures are CEO-only — others never receive the books.
    finance ? loadBooks() : Promise.resolve(null),
    finance ? loadFinInputs() : Promise.resolve(null),
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
      people={await withSignedAvatars([...people])}
      today={tashkentDayKey()}
      books={
        books
          ? { accounts: books.accounts, opening: books.opening, entries: books.entries, courses: books.courses, tax: books.tax }
          : null
      }
      fin={fin}
      finance={finance}
    />
  );
}

import 'server-only';
import { sql } from '@/lib/db/client';
import { daysBetween } from '@/lib/strategy';
import { loadOkr } from '@/lib/strategy-okr-data';
import { objectiveProgress, okrHealth } from '@/lib/strategy-okr';
import { quarterElapsed } from '@/lib/strategy-plan';

export type PortfolioRow = {
  id: string;
  name: string;
  color: string;
  start_date: string;
  end_date: string;
  tasks_total: number;
  tasks_done: number;
  tasks_late: number;
  objectives: number;
  okr_progress: number | null;
  at_risk: number;
  checkins_due: number;
  next_milestone: { title: string; date: string } | null;
};

/** Every strategy space on one screen: delivery, OKR health, what's next. */
export async function loadPortfolio(finance: boolean, today: string, week: string): Promise<PortfolioRow[]> {
  const spaces = await sql<
    (Omit<PortfolioRow, 'objectives' | 'okr_progress' | 'at_risk' | 'checkins_due' | 'next_milestone'> & { ms_title: string | null; ms_date: string | null })[]
  >`
    select s.id, s.name, s.color, s.start_date, s.end_date,
      count(t.id)::int as tasks_total,
      count(t.id) filter (where t.status = 'done')::int as tasks_done,
      count(t.id) filter (where t.status <> 'done' and t.end_date < ${today})::int as tasks_late,
      m.title as ms_title, m.date as ms_date
    from strategy_spaces s
    left join strategy_tasks t on t.space_id = s.id
    left join lateral (
      select title, date from strategy_milestones where space_id = s.id and date >= ${today} order by date limit 1
    ) m on true
    group by s.id, m.title, m.date
    order by s.sort_order, s.created_at`;

  return Promise.all(
    spaces.map(async ({ ms_title, ms_date, ...s }) => {
      const okr = (await loadOkr(s.id, finance).catch(() => [])).filter((o) => o.status === 'active');
      const spaceElapsed = Math.max(0, Math.min(100, Math.round((daysBetween(s.start_date, today) / Math.max(1, daysBetween(s.start_date, s.end_date))) * 100)));
      const ps = okr.map((o) => ({ p: objectiveProgress(o), el: o.quarter ? quarterElapsed(o.quarter, today) : spaceElapsed }));
      const scored = ps.filter((x) => x.p !== null);
      return {
        ...s,
        objectives: okr.length,
        okr_progress: scored.length ? Math.round(scored.reduce((a, x) => a + (x.p ?? 0), 0) / scored.length) : null,
        at_risk: ps.filter((x) => ['risk', 'off'].includes(okrHealth(x.p, x.el))).length,
        checkins_due: okr.flatMap((o) => o.krs).filter((k) => !k.checkins.some((c) => c.week === week)).length,
        next_milestone: ms_title && ms_date ? { title: ms_title, date: ms_date } : null,
      };
    }),
  );
}

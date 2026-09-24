import 'server-only';
import { sql } from '@/lib/db/client';
import type { TeacherProgressRow, TeacherSeries } from '@/components/dashboard/teacher-progress-chart-card';

/**
 * Every active staff member's self-development score (`self_development.
 * ceo_score`, the CEO's monthly review) as one line per person, pivoted into
 * one row per month / one column per person so the client chart stays a dumb
 * renderer. Shared by the CEO dashboard and the CEO view of
 * /self-development, so the two charts can never disagree.
 *
 * Only people who have actually been scored at least once carry a line; an
 * employee the CEO hasn't reviewed yet has no "growth" to draw and would just
 * be an empty legend entry.
 */
export async function loadEmployeeGrowth(): Promise<{ teachers: TeacherSeries[]; data: TeacherProgressRow[] }> {
  const staffList = await sql<{ id: string; first_name: string; last_name: string }[]>`
    select id, first_name, last_name from profiles
    where is_active = true and role <> 'ceo'
    order by first_name asc
  `;

  // `month` is normalized to a plain `YYYY-MM-01` string right here rather
  // than shipped as whatever the column happens to be: the client card
  // builds a Date out of it, and a raw timestamp wire value
  // ("2026-09-01 00:00:00+00") makes `${month}T00:00:00Z` an Invalid Date —
  // which throws out of Intl formatting and takes the whole chart with it.
  // date_trunc also folds any row that wasn't stored on the 1st into its
  // own month, so two entries can't produce two adjacent X points.
  const scores =
    staffList.length > 0
      ? await sql<{ month: string; ceo_score: number; user_id: string }[]>`
          select to_char(date_trunc('month', month), 'YYYY-MM-DD') as month,
                 ceo_score,
                 user_id
          from self_development
          where user_id in ${sql(staffList.map((t) => t.id))} and ceo_score is not null
          order by date_trunc('month', month) asc
        `
      : [];

  const scoredIds = new Set(scores.map((s) => s.user_id));
  const seriesList = staffList.filter((s) => scoredIds.has(s.id));

  const rowByMonth = new Map<string, Record<string, number | null>>();
  for (const s of scores) {
    let row = rowByMonth.get(s.month);
    if (!row) {
      row = {};
      rowByMonth.set(s.month, row);
    }
    row[s.user_id] = s.ceo_score;
  }

  const ids = seriesList.map((t) => t.id);
  // Sorted here instead of relying on the query's ordering surviving the
  // pivot — `YYYY-MM-01` strings sort lexicographically == chronologically.
  // Every person gets an explicit `null` for a month they weren't scored
  // in, so recharts sees a real gap (and `connectNulls` bridges it) rather
  // than an absent key.
  const data = [...rowByMonth.keys()].sort().map((month) => {
    const row = rowByMonth.get(month)!;
    const filled: Record<string, number | null> = {};
    for (const id of ids) filled[id] = row[id] ?? null;
    return { month, ...filled };
  });

  return {
    teachers: seriesList.map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}` })),
    data,
  };
}

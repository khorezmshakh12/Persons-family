'use server';

import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';

export type CommandSearchResult = {
  staff: { id: string; name: string; role: string }[];
  groups: { id: string; name: string }[];
  issues: { id: string; title: string }[];
};

const EMPTY: CommandSearchResult = { staff: [], groups: [], issues: [] };

/**
 * Results are scoped in the WHERE clause itself, not fetched-then-filtered
 * — this replaces what groups_select/issues_select RLS used to enforce
 * (profiles_select_all had no scoping, so that one table is unrestricted,
 * same as before):
 *   - groups: visible to ceo/head_teacher, the owning teacher, or the
 *     assigned TA (mirrors groups_select + is_assigned_ta()).
 *   - issues: CEO-exclusive now (the whole Issues module is — see
 *     actions/issues.ts) — a non-CEO gets no issue results at all.
 * So results never exceed what the searcher could already see one page at
 * a time — this just searches across pages at once.
 */
export async function searchCommandPaletteAction(query: string): Promise<CommandSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return EMPTY;

  const { user, profile } = await getAuthState();
  if (!user || !profile) return EMPTY;

  const pattern = `%${trimmed}%`;
  const isCeo = profile.role === 'ceo';
  const canSeeAllGroups = profile.role === 'ceo' || profile.role === 'head_teacher';

  const [staffRows, groups, issues] = await Promise.all([
    sql<{ id: string; first_name: string; last_name: string; role: string }[]>`
      select id, first_name, last_name, role from profiles
      where first_name ilike ${pattern} or last_name ilike ${pattern}
      limit 5
    `,
    sql<{ id: string; name: string }[]>`
      select id, name from groups
      where name ilike ${pattern}
        and (${canSeeAllGroups} or teacher_id = ${user.id} or assigned_ta_id = ${user.id})
      limit 5
    `,
    sql<{ id: string; title: string }[]>`
      select id, title from issues
      where title ilike ${pattern}
        and ${isCeo}
      limit 5
    `,
  ]);

  return {
    staff: staffRows.map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, role: p.role })),
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    issues: issues.map((i) => ({ id: i.id, title: i.title })),
  };
}

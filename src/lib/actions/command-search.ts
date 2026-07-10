'use server';

import { createClient } from '@/lib/supabase/server';

export type CommandSearchResult = {
  staff: { id: string; name: string; role: string }[];
  groups: { id: string; name: string }[];
  issues: { id: string; title: string }[];
};

const EMPTY: CommandSearchResult = { staff: [], groups: [], issues: [] };

/** Every query below runs through the caller's own RLS-scoped client, so
 * results never exceed what the searcher could already see one page at a
 * time — this just searches across pages at once. */
export async function searchCommandPaletteAction(query: string): Promise<CommandSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return EMPTY;

  const supabase = await createClient();
  const pattern = `%${trimmed}%`;

  const [{ data: staffByFirst }, { data: staffByLast }, { data: groups }, { data: issues }] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name, role').ilike('first_name', pattern).limit(5),
    supabase.from('profiles').select('id, first_name, last_name, role').ilike('last_name', pattern).limit(5),
    supabase.from('groups').select('id, name').ilike('name', pattern).limit(5),
    supabase.from('issues').select('id, title').ilike('title', pattern).limit(5),
  ]);

  const staffById = new Map(
    [...(staffByFirst ?? []), ...(staffByLast ?? [])].map((p) => [
      p.id,
      { id: p.id, name: `${p.first_name} ${p.last_name}`, role: p.role },
    ]),
  );

  return {
    staff: [...staffById.values()],
    groups: (groups ?? []).map((g) => ({ id: g.id, name: g.name })),
    issues: (issues ?? []).map((i) => ({ id: i.id, title: i.title })),
  };
}

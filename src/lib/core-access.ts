import { can, canSee, MANAGES, type Role } from '@/lib/permissions';

// Pure helpers behind Core's per-viewer data boundary (lib/core-state.ts).
// No DB access here, so tests/permissions.test.ts can run them against
// fixture data for every role.

/** The slice of Core's staff record these helpers touch. */
type StaffPay = { sal: number };

/**
 * Strips what this viewer's role may not read before Core's state leaves the
 * server (the page itself only hides menus — this is the actual boundary):
 *  - pay (`staff[*].sal`) unless finance.viewAll — own salary always kept;
 *  - leads / ad spend / targets unless the Sales or Report section is theirs;
 *  - per-person bonus / KPI maps down to themselves + their team, unless
 *    they have the company-wide or finance view;
 *  - the CEO's per-person access list unless they run the platform.
 * Mutates `staff` and `st` in place.
 */
export function redactForViewer(
  role: string,
  myKey: string,
  team: Set<string>,
  staff: Record<string, StaffPay>,
  st: Record<string, unknown>,
) {
  if (!can(role, 'finance.viewAll')) {
    for (const [k, p] of Object.entries(staff)) if (k !== myKey) p.sal = 0;
  }
  if (!canSee(role, 'sales') && !canSee(role, 'report')) {
    delete st.leads;
    delete st.spend;
    delete st.tgt;
  }
  if (!can(role, 'company.overview') && !can(role, 'finance.viewAll')) {
    for (const key of ['bonus', 'kpi']) {
      const m = st[key];
      if (m && typeof m === 'object') st[key] = Object.fromEntries(Object.entries(m).filter(([who]) => team.has(who)));
    }
  }
  if (!canSee(role, 'platform')) delete st.acl;
}

/** Each person's default Core boss from the org chart (MANAGES): the most
 * specific active manager of their role (a Head Teacher before the Academic
 * Director before the COO), else the CEO. A boss set in Core wins over it. */
export function defaultBosses(
  rows: { id: string; role: string; is_active: boolean }[],
  ceoId: string | null,
): Record<string, string | null> {
  const active = rows.filter((r) => r.is_active);
  const reach = (role: string) => MANAGES[role as Role] ?? [];
  const out: Record<string, string | null> = {};
  for (const p of rows) {
    const managers = active
      .filter((m) => m.id !== p.id && reach(m.role).includes(p.role as Role))
      .sort((a, b) => reach(a.role).length - reach(b.role).length);
    out[p.id] = managers[0]?.id ?? ceoId;
  }
  return out;
}

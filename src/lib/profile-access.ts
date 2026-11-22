import { sql } from '@/lib/db/client';
import { canFor } from '@/lib/permissions';

type Viewer = { role: string | null | undefined; section_overrides?: Record<string, boolean> | null } | null | undefined;

/**
 * HR (profiles.viewAll) reads another staff member's profile — no money, no
 * edits — except CEO/COO, by main role or an extra position (owner, 2026-11-23).
 */
export async function hrCanViewProfile(viewer: Viewer, targetId: string): Promise<boolean> {
  if (!canFor(viewer, 'profiles.viewAll')) return false;
  const rows = await sql`
    select 1 from profiles p
    where p.id = ${targetId}
      and p.role::text not in ('ceo', 'coo')
      and not exists (select 1 from profile_roles r where r.user_id = p.id and r.role::text in ('ceo', 'coo'))
  `;
  return rows.length > 0;
}

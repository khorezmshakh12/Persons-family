'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { CEO_ONLY_OVERRIDES, OVERRIDABLE_SECTIONS, canAssignRoles } from '@/lib/permissions';

export type PlatformActionState = { error?: string } | undefined;

// Platform settings are for people who HOLD CEO or COO (whatever position
// they're working in right now) — same rule as granting positions.
async function requirePlatformAdmin() {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' as const };
  if (!canAssignRoles(profile.roles)) return { error: 'forbidden' as const };
  return { user, held: profile.roles ?? [profile.role] };
}

const accessSchema = z.object({
  userId: z.string().uuid(),
  section: z.enum(OVERRIDABLE_SECTIONS as [string, ...string[]]),
  value: z.enum(['default', 'allow', 'deny']),
});

/** Open / close one section for one person, or back to the role default. */
export async function setSectionAccessAction(userId: string, section: string, value: string): Promise<PlatformActionState> {
  const gate = await requirePlatformAdmin();
  if ('error' in gate) return gate;
  const parsed = accessSchema.safeParse({ userId, section, value });
  if (!parsed.success) return { error: 'invalidInput' };
  const isCeo = gate.held.includes('ceo');
  if (!isCeo && (CEO_ONLY_OVERRIDES as string[]).includes(parsed.data.section)) return { error: 'ceoOnly' };
  try {
    const [target] = await sql<{ role: string; extra: string[] }[]>`
      select p.role::text as role, array(select r.role::text from profile_roles r where r.user_id = p.id) as extra
      from profiles p where p.id = ${parsed.data.userId}
    `;
    if (!target) return { error: 'notFound' };
    if (!isCeo && (target.role === 'ceo' || target.extra.includes('ceo'))) return { error: 'ceoOnly' };
    if (parsed.data.value === 'default') {
      await sql`delete from section_access where user_id = ${parsed.data.userId} and section = ${parsed.data.section}`;
    } else {
      const allow = parsed.data.value === 'allow';
      await sql`
        insert into section_access (user_id, section, allow, set_by)
        values (${parsed.data.userId}, ${parsed.data.section}, ${allow}, ${gate.user.id})
        on conflict (user_id, section) do update set allow = excluded.allow, set_by = excluded.set_by, set_at = now()
      `;
    }
    logSystemAction('section_access', `${parsed.data.section}=${parsed.data.value} → ${parsed.data.userId}`);
  } catch (error) {
    console.error('setSectionAccessAction', error);
    return { error: 'saveFailed' };
  }
  revalidatePath('/', 'layout');
  return {};
}

const targetSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  leads: z.coerce.number().int().min(0).max(1_000_000),
  won: z.coerce.number().int().min(0).max(1_000_000),
});

/** Monthly sales targets (leads / contracts) — the same `tgt` the Sales
 * section and the dashboard Sales card read. Other keys (per-manager
 * targets) are kept. */
export async function setSalesTargetAction(month: string, leads: number, won: number): Promise<PlatformActionState> {
  const gate = await requirePlatformAdmin();
  if ('error' in gate) return gate;
  const parsed = targetSchema.safeParse({ month, leads, won });
  if (!parsed.success) return { error: 'invalidInput' };
  const { month: m, leads: l, won: w } = parsed.data;
  try {
    await sql`
      update core_state
      set data = jsonb_set(
            data,
            array['tgt', ${m}],
            coalesce(data #> array['tgt', ${m}], '{"mgr":{}}'::jsonb) || jsonb_build_object('leads', ${l}::int, 'won', ${w}::int),
            true
          ),
          updated_at = now(), updated_by = ${gate.user.id}
      where id = 1 and data ? 'tgt'
    `;
    await sql`
      update core_state
      set data = data || jsonb_build_object('tgt', jsonb_build_object(${m}::text, jsonb_build_object('leads', ${l}::int, 'won', ${w}::int, 'mgr', '{}'::jsonb))),
          updated_at = now(), updated_by = ${gate.user.id}
      where id = 1 and not (data ? 'tgt')
    `;
    logSystemAction('sales_target', `${m}: leads ${l}, won ${w}`);
  } catch (error) {
    console.error('setSalesTargetAction', error);
    return { error: 'saveFailed' };
  }
  revalidatePath('/', 'layout');
  return {};
}

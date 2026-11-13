'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { ACCESS_KEYS, ROLES, canAssignRoles, isCeoOnlyAccessKey } from '@/lib/permissions';

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
  section: z.enum(ACCESS_KEYS as [string, ...string[]]),
  value: z.enum(['default', 'allow', 'deny']),
});

/** Open / close one section for one person, or back to the role default. */
export async function setSectionAccessAction(userId: string, section: string, value: string): Promise<PlatformActionState> {
  const gate = await requirePlatformAdmin();
  if ('error' in gate) return gate;
  const parsed = accessSchema.safeParse({ userId, section, value });
  if (!parsed.success) return { error: 'invalidInput' };
  const isCeo = gate.held.includes('ceo');
  if (!isCeo && isCeoOnlyAccessKey(parsed.data.section)) return { error: 'ceoOnly' };
  try {
    const [target] = await sql<{ role: string; extra: string[] }[]>`
      select p.role::text as role, array(select r.role::text from profile_roles r where r.user_id = p.id) as extra
      from profiles p where p.id = ${parsed.data.userId}
    `;
    if (!target) return { error: 'notFound' };
    if (!isCeo && (target.role === 'ceo' || target.extra.includes('ceo'))) return { error: 'ceoOnly' };
    const [prev] = await sql<{ allow: boolean }[]>`
      select allow from section_access where user_id = ${parsed.data.userId} and section = ${parsed.data.section}`;
    const before = prev ? (prev.allow ? 'allow' : 'deny') : 'default';
    if (before !== parsed.data.value)
      await sql`
        insert into platform_changes (actor, kind, target, key, before, after)
        values (${gate.user.id}, 'section_access', ${parsed.data.userId}, ${parsed.data.section}, ${before}, ${parsed.data.value})`;
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

const roleAccessSchema = z.object({
  // CEO always has everything — a CEO role row would do nothing.
  role: z.enum(ROLES as unknown as [string, ...string[]]).refine((r) => r !== 'ceo'),
  key: z.enum(ACCESS_KEYS as [string, ...string[]]),
  value: z.enum(['default', 'allow', 'deny']),
});

/** Open / close one section or function for everyone in a role, or back to
 * the code default. A per-person override still wins over this. */
export async function setRoleAccessAction(role: string, key: string, value: string): Promise<PlatformActionState> {
  const gate = await requirePlatformAdmin();
  if ('error' in gate) return gate;
  const parsed = roleAccessSchema.safeParse({ role, key, value });
  if (!parsed.success) return { error: 'invalidInput' };
  const { role: r, key: k, value: v } = parsed.data;
  if (!gate.held.includes('ceo') && isCeoOnlyAccessKey(k)) return { error: 'ceoOnly' };
  try {
    const [prev] = await sql<{ allow: boolean }[]>`select allow from role_access where role = ${r} and key = ${k}`;
    const before = prev ? (prev.allow ? 'allow' : 'deny') : 'default';
    if (before !== v)
      await sql`
        insert into platform_changes (actor, kind, target, key, before, after)
        values (${gate.user.id}, 'role_access', null, ${`${r}|${k}`}, ${before}, ${v})`;
    if (v === 'default') {
      await sql`delete from role_access where role = ${r} and key = ${k}`;
    } else {
      await sql`
        insert into role_access (role, key, allow, set_by)
        values (${r}, ${k}, ${v === 'allow'}, ${gate.user.id})
        on conflict (role, key) do update set allow = excluded.allow, set_by = excluded.set_by, set_at = now()
      `;
    }
    logSystemAction('role_access', `${r}: ${k}=${v}`);
  } catch (error) {
    console.error('setRoleAccessAction', error);
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

/** Undo one journal entry: put the section access back to its "before". */
export async function revertPlatformChangeAction(changeId: string): Promise<PlatformActionState> {
  const gate = await requirePlatformAdmin();
  if ('error' in gate) return gate;
  if (!z.string().uuid().safeParse(changeId).success) return { error: 'invalidInput' };
  const [c] = await sql<{ kind: string; target: string; key: string; before: string; reverted_at: string | null }[]>`
    select kind, target, key, before, reverted_at from platform_changes where id = ${changeId}`;
  if (!c || (c.kind !== 'section_access' && c.kind !== 'role_access')) return { error: 'notFound' };
  if (c.reverted_at) return { error: 'alreadyReverted' };
  const [role, key] = c.key.split('|');
  const res =
    c.kind === 'role_access'
      ? await setRoleAccessAction(role, key ?? '', c.before)
      : await setSectionAccessAction(c.target, c.key, c.before);
  if (res?.error) return res;
  await sql`update platform_changes set reverted_at = now(), reverted_by = ${gate.user.id} where id = ${changeId}`;
  return {};
}

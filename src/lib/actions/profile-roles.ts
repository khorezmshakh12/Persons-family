'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ACTIVE_ROLE_COOKIE, getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { ROLES, canAssignRoles, canGrantRole } from '@/lib/permissions';

export type RoleActionState = { error?: string } | undefined;

/** Switch the position you're working in (header switcher). */
export async function setActiveRoleAction(role: string): Promise<RoleActionState> {
  const { profile } = await getAuthState();
  if (!profile) return { error: 'sessionExpired' };
  if (!profile.roles?.includes(role as never)) return { error: 'forbidden' };
  const jar = await cookies();
  if (role === profile.primary_role) jar.delete(ACTIVE_ROLE_COOKIE);
  else jar.set(ACTIVE_ROLE_COOKIE, role, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
  return {};
}

const grantSchema = z.object({ userId: z.string().uuid(), role: z.enum(ROLES) });

async function targetRoles(userId: string): Promise<{ primary: string; held: string[] } | null> {
  const [row] = await sql<{ role: string; extra: string[] }[]>`
    select p.role::text as role, array(select r.role::text from profile_roles r where r.user_id = p.id) as extra
    from profiles p where p.id = ${userId}
  `;
  return row ? { primary: row.role, held: [row.role, ...row.extra] } : null;
}

/** Give someone (yourself included) an extra position. CEO / COO only. */
export async function grantRoleAction(userId: string, role: string): Promise<RoleActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!canAssignRoles(profile.roles)) return { error: 'forbidden' };
  const parsed = grantSchema.safeParse({ userId, role });
  if (!parsed.success) return { error: 'invalidInput' };
  try {
    const target = await targetRoles(parsed.data.userId);
    if (!target) return { error: 'notFound' };
    if (!canGrantRole(profile.roles, parsed.data.role, target.held)) return { error: 'forbidden' };
    if (target.held.includes(parsed.data.role)) return {};
    await sql`
      insert into profile_roles (user_id, role, granted_by)
      values (${parsed.data.userId}, ${parsed.data.role}, ${user.id})
      on conflict do nothing
    `;
    logSystemAction('role_granted', `${parsed.data.role} → ${parsed.data.userId}`);
  } catch (error) {
    console.error('grantRoleAction', error);
    return { error: 'saveFailed' };
  }
  revalidatePath('/', 'layout');
  return {};
}

/** Take an extra position away (the primary one is changed in Xodimlar). */
export async function revokeRoleAction(userId: string, role: string): Promise<RoleActionState> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!canAssignRoles(profile.roles)) return { error: 'forbidden' };
  const parsed = grantSchema.safeParse({ userId, role });
  if (!parsed.success) return { error: 'invalidInput' };
  try {
    const target = await targetRoles(parsed.data.userId);
    if (!target) return { error: 'notFound' };
    if (!canGrantRole(profile.roles, parsed.data.role, target.held)) return { error: 'forbidden' };
    if (parsed.data.role === target.primary) return { error: 'primaryRole' };
    // Never leave yourself without the right to manage positions.
    if (parsed.data.userId === user.id && !canAssignRoles(target.held.filter((r) => r !== parsed.data.role))) {
      return { error: 'lastGranter' };
    }
    await sql`delete from profile_roles where user_id = ${parsed.data.userId} and role = ${parsed.data.role}`;
    logSystemAction('role_revoked', `${parsed.data.role} ✕ ${parsed.data.userId}`);
  } catch (error) {
    console.error('revokeRoleAction', error);
    return { error: 'saveFailed' };
  }
  revalidatePath('/', 'layout');
  return {};
}

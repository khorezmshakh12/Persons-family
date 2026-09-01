'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { deleteIdentityUser, setUserClaims } from '@/lib/gcp/adminAuth';
import { revokeUserSessions } from '@/lib/gcp/session';

export type AdminManagementState = { error?: string } | undefined;

const idSchema = z.object({ id: z.string().uuid() });

/** Confirms the target is actually an Admin Manager — every action here is
 * scoped to that one role, never teachers/assistants/other CEOs, matching
 * exactly what was asked for and nothing broader. */
async function requireAdminTarget(id: string) {
  const [target] = await sql<{ role: string; is_active: boolean }[]>`
    select role, is_active from profiles where id = ${id}
  `;
  if (!target || target.role !== 'admin_manager') return null;
  return target;
}

export async function toggleAdminActiveAction(
  _prevState: AdminManagementState,
  formData: FormData,
): Promise<AdminManagementState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const target = await requireAdminTarget(parsed.data.id);
  if (!target) return { error: 'notFound' };

  try {
    await sql`update profiles set is_active = ${!target.is_active} where id = ${parsed.data.id}`;
  } catch {
    return { error: 'updateFailed' };
  }

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

/**
 * Full account removal, not just the profile row — deletes the Identity
 * Platform account and the profiles row as two explicit steps. Unlike
 * Supabase's auth.users cascade, Cloud SQL has no FK back to Identity
 * Platform, so this isn't atomic across the two systems (same tradeoff as
 * staff.ts's deleteStaffAction — CEO-only, rare, and a lingering row with
 * no matching login is harmless).
 */
export async function deleteAdminAction(
  _prevState: AdminManagementState,
  formData: FormData,
): Promise<AdminManagementState> {
  let actingUser;
  try {
    ({ user: actingUser } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.id === actingUser.id) return { error: 'cannotDeleteSelf' };

  const target = await requireAdminTarget(parsed.data.id);
  if (!target) return { error: 'notFound' };

  try {
    await deleteIdentityUser(parsed.data.id);
  } catch {
    return { error: 'deleteFailed' };
  }
  try {
    await sql`delete from profiles where id = ${parsed.data.id}`;
  } catch {
    return { error: 'deleteFailed' };
  }

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

export type SystemBackup = {
  exportedAt: string;
  company: string;
  profiles: Record<string, unknown>[];
  groups: Record<string, unknown>[];
  courseLessons: Record<string, unknown>[];
};

/** Backs the settings page's "export a JSON backup" button — used to run
 * as three RLS-scoped client-side queries; there's no client-side Postgres
 * access anymore, so this moved server-side. CEO-only, same as the button
 * itself (only ever rendered for a CEO), re-checked here as usual. */
export async function exportSystemBackupAction(): Promise<{ backup?: SystemBackup; error?: string }> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const [profiles, groups, courseLessons] = await Promise.all([
    sql<Record<string, unknown>[]>`select * from profiles`,
    sql<Record<string, unknown>[]>`select * from groups`,
    sql<Record<string, unknown>[]>`select * from course_lessons`,
  ]);

  return {
    backup: {
      exportedAt: new Date().toISOString(),
      company: 'Persons Education Company',
      profiles,
      groups,
      courseLessons,
    },
  };
}

/**
 * Hands the CEO role to an Administrative Manager. This is a *transfer*, not
 * a second appointment: the acting CEO is demoted to admin_manager in the
 * same transaction, so the company always has exactly one CEO. Both
 * accounts' custom claims are re-stamped and their live sessions revoked —
 * the (now ex-)CEO is signed out and comes back in as an admin_manager.
 */
export async function transferCeoRoleAction(
  _prevState: AdminManagementState,
  formData: FormData,
): Promise<AdminManagementState> {
  let actingId: string;
  try {
    ({
      user: { id: actingId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.id === actingId) return { error: 'invalidInput' };

  const [target] = await sql<{ role: string; must_change_password: boolean }[]>`
    select role, must_change_password from profiles where id = ${parsed.data.id}
  `;
  if (!target || target.role !== 'admin_manager') return { error: 'notFound' };

  try {
    await sql.begin(async (tx) => {
      await tx`update profiles set role = 'admin_manager' where id = ${actingId}`;
      await tx`update profiles set role = 'ceo' where id = ${parsed.data.id}`;
    });
  } catch {
    return { error: 'updateFailed' };
  }

  // Best-effort claim + session sync — the DB rows above already committed
  // and are authoritative; a claim hiccup must not fail the transfer.
  try {
    await setUserClaims(actingId, { role: 'admin_manager', mustChangePassword: false });
    await setUserClaims(parsed.data.id, { role: 'ceo', mustChangePassword: target.must_change_password });
    await revokeUserSessions(actingId);
    await revokeUserSessions(parsed.data.id);
  } catch (error) {
    console.error('transferCeoRoleAction: claim sync failed', error instanceof Error ? error.message : error);
  }

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

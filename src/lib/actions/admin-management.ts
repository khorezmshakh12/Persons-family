'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type AdminManagementState = { error?: string } | undefined;

const idSchema = z.object({ id: z.string().uuid() });

/** Confirms the target is actually an Admin Manager — every action here is
 * scoped to that one role, never teachers/assistants/other CEOs, matching
 * exactly what was asked for and nothing broader. */
async function requireAdminTarget(id: string) {
  const supabase = await createClient();
  const { data: target } = await supabase.from('profiles').select('role, is_active').eq('id', id).maybeSingle();
  if (!target || target.role !== 'admin_manager') return null;
  return target;
}

export async function toggleAdminActiveAction(
  _prevState: AdminManagementState,
  formData: FormData,
): Promise<AdminManagementState> {
  try {
    await requireCeo();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const target = await requireAdminTarget(parsed.data.id);
  if (!target) return { error: 'notFound' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: !target.is_active })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

/**
 * Full account removal, not just the profile row — uses the service role to
 * delete the auth.users entry directly, which cascades to profiles (see
 * `profiles.id references auth.users(id) on delete cascade`). Deleting only
 * the profiles row would leave a live but orphaned Supabase Auth account
 * behind.
 */
export async function deleteAdminAction(
  _prevState: AdminManagementState,
  formData: FormData,
): Promise<AdminManagementState> {
  let actingUser;
  try {
    ({ user: actingUser } = await requireCeo());
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.id === actingUser.id) return { error: 'cannotDeleteSelf' };

  const target = await requireAdminTarget(parsed.data.id);
  if (!target) return { error: 'notFound' };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(parsed.data.id);
  if (error) return { error: 'deleteFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

export async function transferCeoRoleAction(
  _prevState: AdminManagementState,
  formData: FormData,
): Promise<AdminManagementState> {
  try {
    await requireCeo();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const target = await requireAdminTarget(parsed.data.id);
  if (!target) return { error: 'notFound' };

  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ role: 'ceo' }).eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

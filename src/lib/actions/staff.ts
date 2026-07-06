'use server';

import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone, phoneToSyntheticEmail } from '@/lib/auth/phone';
import { AVATAR_ALLOWED_TYPES } from '@/lib/avatar-constants';

export type StaffActionState =
  | { error?: string; tempPassword?: string; userId?: string }
  | undefined;

const ROLES = ['ceo', 'admin_manager', 'teacher', 'assistant', 'smm', 'mobilgrof', 'it_developer'] as const;

/** CEO and Admin Manager are equal for day-to-day operations, but managing
 * an Admin (or CEO) account itself — editing, deactivating, resetting their
 * password, or promoting someone into either role — is reserved to the CEO
 * alone. */
function isProtectedRole(role: string) {
  return role === 'ceo' || role === 'admin_manager';
}

function assignRoleError(role: string): 'cannotAssignCeo' | 'cannotAssignAdmin' {
  return role === 'ceo' ? 'cannotAssignCeo' : 'cannotAssignAdmin';
}

function manageRoleError(role: string): 'cannotManageCeo' | 'cannotManageAdmin' {
  return role === 'ceo' ? 'cannotManageCeo' : 'cannotManageAdmin';
}

const staffSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1),
  dateOfBirth: z.string().min(1),
  role: z.enum(ROLES),
});

function generateTempPassword() {
  return randomBytes(9).toString('base64url');
}

export type UploadUrlResult = { path?: string; token?: string; error?: string };

/**
 * Issues a signed upload URL so the admin's browser can send the avatar
 * straight to Supabase Storage — never through this Next.js server —
 * avoiding both Next's default 1MB Server Action body limit and Vercel's
 * hard 4.5MB serverless function payload limit. The RLS check for
 * `avatars_admin_manage` runs right here, at signed-URL creation time.
 */
export async function requestAvatarUploadUrlAction(
  targetUserId: string,
  fileName: string,
  fileType: string,
): Promise<UploadUrlResult> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireAdmin());
  } catch {
    return { error: 'forbidden' };
  }

  const ext = AVATAR_ALLOWED_TYPES[fileType];
  if (!ext) return { error: 'invalidAvatarType' };

  const supabase = await createClient();

  // The target may not have a profile row yet (mid-creation flow) — only
  // enforce the ceo-protection check when there's an existing row to check.
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle();
  if (target && targetUserId !== actingProfile.id && isProtectedRole(target.role) && actingProfile.role !== 'ceo') {
    return { error: manageRoleError(target.role) };
  }

  const path = `${targetUserId}/avatar.${ext}`;
  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { error: 'uploadFailed' };

  return { path, token: data.token };
}

export async function createStaffAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireAdmin());
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (isProtectedRole(parsed.data.role) && actingProfile.role !== 'ceo') {
    return { error: assignRoleError(parsed.data.role) };
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: 'invalidPhone' };

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: phoneToSyntheticEmail(phone),
    password: tempPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { error: createError?.message.includes('already been registered') ? 'phoneTaken' : 'createFailed' };
  }

  const supabase = await createClient();
  const { error: profileError } = await supabase.from('profiles').insert({
    id: created.user.id,
    phone,
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    date_of_birth: parsed.data.dateOfBirth,
    role: parsed.data.role,
    created_by: actingProfile.id,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: 'createFailed' };
  }

  revalidatePath('/[locale]/staff', 'page');
  return { tempPassword, userId: created.user.id };
}

/** Attaches an avatar already uploaded (via requestAvatarUploadUrlAction) to a staff profile. */
export async function attachAvatarAction(
  targetUserId: string,
  avatarPath: string,
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { error: 'forbidden' };
  }

  const supabase = await createClient();
  const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: data.publicUrl })
    .eq('id', targetUserId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

const updateSchema = staffSchema.extend({
  id: z.string().uuid(),
  avatarPath: z.string().optional().or(z.literal('')),
});

export async function updateStaffAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireAdmin());
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', parsed.data.id)
    .single();
  if (!target) return { error: 'notFound' };
  const isSelf = parsed.data.id === actingProfile.id;
  if (!isSelf && isProtectedRole(target.role) && actingProfile.role !== 'ceo') {
    return { error: manageRoleError(target.role) };
  }
  // Only a genuine role *change* into ceo/admin_manager is blocked — an
  // admin_manager editing their own profile still resubmits their current
  // (unchanged) role through this same form field.
  if (parsed.data.role !== target.role && isProtectedRole(parsed.data.role) && actingProfile.role !== 'ceo') {
    return { error: assignRoleError(parsed.data.role) };
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: 'invalidPhone' };

  let avatarUrl: string | undefined;
  if (parsed.data.avatarPath) {
    avatarUrl = supabase.storage.from('avatars').getPublicUrl(parsed.data.avatarPath).data.publicUrl;
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone,
      date_of_birth: parsed.data.dateOfBirth,
      role: parsed.data.role,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

const idSchema = z.object({ id: z.string().uuid() });

export async function toggleStaffActiveAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireAdmin());
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.id === actingProfile.id) return { error: 'cannotDeactivateSelf' };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', parsed.data.id)
    .single();
  if (!target) return { error: 'notFound' };
  if (isProtectedRole(target.role) && actingProfile.role !== 'ceo') {
    return { error: manageRoleError(target.role) };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: !target.is_active })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

export async function resetStaffPasswordAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireAdmin());
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', parsed.data.id)
    .single();
  if (!target) return { error: 'notFound' };
  if (parsed.data.id !== actingProfile.id && isProtectedRole(target.role) && actingProfile.role !== 'ceo') {
    return { error: manageRoleError(target.role) };
  }

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(parsed.data.id, {
    password: tempPassword,
  });
  if (authError) return { error: 'updateFailed' };

  const { error } = await supabase
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', parsed.data.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return { tempPassword };
}

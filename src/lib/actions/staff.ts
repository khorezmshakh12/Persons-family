'use server';

import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone, phoneToSyntheticEmail } from '@/lib/auth/phone';
import type { Database } from '@/lib/supabase/types';

export type StaffActionState = { error?: string; tempPassword?: string } | undefined;

const ROLES = ['ceo', 'admin_manager', 'teacher', 'assistant'] as const;

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = ['image/png', 'image/jpeg'];

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

/**
 * Uploads to the avatars bucket using the CALLER's own authenticated client
 * (never the service-role client) so the `avatars_admin_manage` RLS policy —
 * and not a blanket bypass — is what authorizes the write.
 */
async function uploadAvatarIfProvided(
  supabase: SupabaseClient<Database>,
  userId: string,
  avatar: FormDataEntryValue | null,
) {
  if (!(avatar instanceof File) || avatar.size === 0) return null;

  if (!AVATAR_ALLOWED_TYPES.includes(avatar.type)) throw new Error('invalidAvatarType');
  if (avatar.size > AVATAR_MAX_BYTES) throw new Error('avatarTooLarge');

  const ext = avatar.type === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, avatar, { upsert: true, contentType: avatar.type });
  if (error) throw new Error('uploadFailed');

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
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
  if (parsed.data.role === 'ceo' && actingProfile.role !== 'ceo') return { error: 'cannotAssignCeo' };

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

  let avatarUrl: string | null = null;
  try {
    avatarUrl = await uploadAvatarIfProvided(supabase, created.user.id, formData.get('avatar'));
  } catch (err) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: err instanceof Error ? err.message : 'uploadFailed' };
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: created.user.id,
    phone,
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    date_of_birth: parsed.data.dateOfBirth,
    role: parsed.data.role,
    avatar_url: avatarUrl,
    created_by: actingProfile.id,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: 'createFailed' };
  }

  revalidatePath('/[locale]/staff', 'page');
  return { tempPassword };
}

const updateSchema = staffSchema.extend({ id: z.string().uuid() });

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
  if (target.role === 'ceo' && actingProfile.role !== 'ceo') return { error: 'cannotManageCeo' };
  if (parsed.data.role === 'ceo' && actingProfile.role !== 'ceo') return { error: 'cannotAssignCeo' };

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: 'invalidPhone' };

  let avatarUrl: string | null = null;
  try {
    avatarUrl = await uploadAvatarIfProvided(supabase, parsed.data.id, formData.get('avatar'));
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'uploadFailed' };
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
  if (target.role === 'ceo' && actingProfile.role !== 'ceo') return { error: 'cannotManageCeo' };

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
  if (target.role === 'ceo' && actingProfile.role !== 'ceo') return { error: 'cannotManageCeo' };

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

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ProfileActionState =
  { error?: string; success?: boolean; firstName?: string; lastName?: string } | undefined;

const profileSchema = z
  .object({
    fullName: z.string().trim().min(1),
    newPassword: z.string().optional().or(z.literal('')),
    confirmPassword: z.string().optional().or(z.literal('')),
  })
  .refine(
    (data) =>
      data.newPassword || data.confirmPassword ? data.newPassword === data.confirmPassword : true,
    {
      path: ['confirmPassword'],
      message: 'passwordMismatch',
    },
  )
  .refine((data) => !data.newPassword || data.newPassword.length >= 8, {
    path: ['newPassword'],
    message: 'passwordTooShort',
  });

/**
 * Self-service equivalent of updateStaffAction in staff.ts, scoped to only
 * what any staff member may change about their own account: display name
 * and password. Role/phone/date_of_birth/is_active stay admin-only (enforced
 * again at the DB level by protect_profile_fields_trigger, not just here).
 */
export async function updateOwnProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    if (message === 'passwordMismatch' || message === 'passwordTooShort') return { error: message };
    return { error: 'invalidName' };
  }

  const fullName = parsed.data.fullName.replace(/\s+/g, ' ');
  const spaceIdx = fullName.indexOf(' ');
  if (spaceIdx === -1) return { error: 'invalidName' };
  const firstName = fullName.slice(0, spaceIdx);
  const lastName = fullName.slice(spaceIdx + 1);
  if (!firstName || !lastName) return { error: 'invalidName' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'forbidden' };

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ first_name: firstName, last_name: lastName })
    .eq('id', user.id);
  if (profileError) return { error: 'updateFailed' };

  if (parsed.data.newPassword) {
    const { error: authError } = await supabase.auth.updateUser({
      password: parsed.data.newPassword,
    });
    if (authError) return { error: 'passwordUpdateFailed' };
  }

  revalidatePath('/[locale]/settings', 'page');
  return { success: true, firstName, lastName };
}

const contactInfoSchema = z.object({
  email: z.string().trim().max(255).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  emergencyContact: z.string().trim().max(255).optional().or(z.literal('')),
});

/** Self-service only — email/address/emergency_contact are deliberately not
 * in protect_profile_fields' blocked-fields list (unlike phone/DOB/role),
 * so profiles_update_self already permits this at the RLS layer. See
 * 20260803095000_profile_contact_info.sql for why the CEO doesn't get an
 * override path for someone else's contact info here. */
export async function updateOwnContactInfoAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = contactInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'forbidden' };

  const { error } = await supabase
    .from('profiles')
    .update({
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      emergency_contact: parsed.data.emergencyContact || null,
    })
    .eq('id', user.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/profile/[id]', 'page');
  return { success: true };
}

/** Persists an avatar the browser already uploaded directly to the `avatars`
 * bucket (own-folder path, RLS-checked at the storage level — no signed URL
 * detour needed here since, unlike staff.ts's admin flow, the caller is
 * always uploading to their own path). */
export async function updateOwnAvatarAction(
  avatarPath: string,
): Promise<{ avatarUrl?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'forbidden' };

  if (!avatarPath.startsWith(`${user.id}/`)) return { error: 'forbidden' };

  const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: data.publicUrl })
    .eq('id', user.id);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/settings', 'page');
  return { avatarUrl: data.publicUrl };
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getAuth } from 'firebase-admin/auth';
import { sql } from '@/lib/db/client';
import { getFirebaseAdminApp } from '@/lib/gcp/credentials';
import { getCurrentUser } from '@/lib/gcp/session';
import { createSignedWriteUrl } from '@/lib/gcp/storage';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { AVATAR_ALLOWED_TYPES } from '@/lib/avatar-constants';

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
 * and password. Role/phone/date_of_birth/is_active stay admin-only — that
 * used to also be re-enforced at the DB level by
 * protect_profile_fields_trigger; this action simply never writes those
 * columns, which is now the only enforcement (the trigger wasn't part of
 * the table/data migration to Cloud SQL).
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

  const user = await getCurrentUser();
  if (!user) return { error: 'sessionExpired' };

  await sql`update profiles set first_name = ${firstName}, last_name = ${lastName} where id = ${user.uid}`;

  if (parsed.data.newPassword) {
    try {
      await getAuth(getFirebaseAdminApp()).updateUser(user.uid, { password: parsed.data.newPassword });
    } catch {
      return { error: 'passwordUpdateFailed' };
    }
  }

  revalidatePath('/[locale]/settings', 'page');
  return { success: true, firstName, lastName };
}

const contactInfoSchema = z.object({
  emergencyContact: z.string().trim().max(255).optional().or(z.literal('')),
});

/** Self-service only — emergency_contact was deliberately left out of the
 * old protect_profile_fields blocked-fields list (unlike phone/DOB/role),
 * so this has always been writable by the owner alone; the CEO has no
 * override path for someone else's contact info here. Email/address used
 * to be editable here too but aren't collected at all anymore — staff have
 * no use for them and they were never shown anywhere but this card. */
export async function updateOwnContactInfoAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = contactInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const user = await getCurrentUser();
  if (!user) return { error: 'sessionExpired' };

  await sql`update profiles set emergency_contact = ${parsed.data.emergencyContact || null} where id = ${user.uid}`;

  revalidatePath('/[locale]/profile/[id]', 'page');
  return { success: true };
}

export type OwnAvatarUploadUrlResult = { path?: string; url?: string; error?: string };

/**
 * Issues a signed upload URL scoped to the caller's own avatar path.
 * Replaces the old flow where the browser uploaded straight to Supabase
 * Storage with storage-level RLS checking the own-folder path prefix —
 * Cloud Storage has no equivalent client-side-authorized upload, so every
 * upload now goes through a signed URL minted server-side (same pattern as
 * staff.ts's requestAvatarUploadUrlAction, just self-scoped with no admin
 * check needed).
 */
export async function requestOwnAvatarUploadUrlAction(fileType: string): Promise<OwnAvatarUploadUrlResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'sessionExpired' };

  const ext = AVATAR_ALLOWED_TYPES[fileType];
  if (!ext) return { error: 'invalidAvatarType' };

  const path = `${user.uid}/avatar.${ext}`;
  const url = await createSignedWriteUrl('avatars', path, fileType);
  return { path, url };
}

/** Persists an avatar the browser already uploaded (via
 * requestOwnAvatarUploadUrlAction above) to the `avatars` bucket. Stores
 * just the private object path — there's no public URL to resolve here;
 * callers resolve a fresh signed read URL wherever the avatar is displayed
 * (see lib/gcp/avatarUrl.ts). */
export async function updateOwnAvatarAction(avatarPath: string): Promise<{ error?: string; avatarUrl?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'sessionExpired' };

  if (!avatarPath.startsWith(`${user.uid}/`)) return { error: 'forbidden' };

  await sql`update profiles set avatar_url = ${avatarPath} where id = ${user.uid}`;

  revalidatePath('/[locale]/settings', 'page');
  // A freshly-minted signed read URL, purely so the caller's UI can update
  // immediately — the stored value is still just the private object path.
  return { avatarUrl: (await resolveAvatarUrl(avatarPath)) ?? undefined };
}

'use server';

import { z } from 'zod';
import { randomBytes, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireAdmin, requireStaffManager, authErrorCode } from '@/lib/auth/require-admin';
import type { Profile } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { createIdentityUser, setUserPassword, deleteIdentityUser, updateIdentityUserEmail, setUserClaims } from '@/lib/gcp/adminAuth';
import { revokeUserSessions } from '@/lib/gcp/session';
import { createSignedWriteUrl } from '@/lib/gcp/storage';
import { normalizePhone, phoneToSyntheticEmail } from '@/lib/auth/phone';
import { AVATAR_ALLOWED_TYPES } from '@/lib/avatar-constants';
import { logSystemAction } from '@/lib/audit-log';
import { sendTelegramMessage } from '@/lib/telegram';
import { INTERNSHIP_LEVELS, type InternshipLevel } from '@/lib/internship-level';
import { fieldErrorCodes, type FieldErrors } from '@/lib/form-errors';

export type StaffActionState =
  | { error?: string; fieldErrors?: FieldErrors; tempPassword?: string; userId?: string }
  | undefined;

const ROLES = [
  'ceo',
  'admin_manager',
  'teacher',
  'head_teacher',
  'assistant',
  'mmd',
  'internship',
  'it_developer',
] as const;

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

// Telegram ID is required at creation time (not on later edits — an
// existing staff member's own /telegram-setup self-link takes precedence)
// so notifications reach them from day one instead of needing someone to
// remember a separate manual-linking step after the fact.
const telegramIdField = z.coerce.number().int().positive();

function generateTempPassword() {
  return randomBytes(9).toString('base64url');
}

export type UploadUrlResult = { path?: string; url?: string; error?: string };

/**
 * Issues a signed upload URL so the admin's browser can PUT the avatar
 * straight to Cloud Storage — never through this Next.js server — avoiding
 * both Next's default 1MB Server Action body limit and any serverless
 * function payload limit. Authorization runs right here, at signed-URL
 * creation time.
 */
export async function requestAvatarUploadUrlAction(
  targetUserId: string,
  fileName: string,
  fileType: string,
): Promise<UploadUrlResult> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireStaffManager());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const ext = AVATAR_ALLOWED_TYPES[fileType];
  if (!ext) return { error: 'invalidAvatarType' };

  // The target may not have a profile row yet (mid-creation flow) — only
  // enforce the ceo-protection check when there's an existing row to check.
  const [target] = await sql<{ role: string }[]>`select role from profiles where id = ${targetUserId}`;
  if (
    target &&
    targetUserId !== actingProfile.id &&
    isProtectedRole(target.role) &&
    actingProfile.role !== 'ceo'
  ) {
    return { error: manageRoleError(target.role) };
  }

  const path = `${targetUserId}/avatar.${ext}`;
  const url = await createSignedWriteUrl('avatars', path, fileType);
  return { path, url };
}

/** Shared account-creation core for createStaffAction — authorization
 * happens entirely in the caller before this runs. */
async function createStaffRow(
  actingProfile: Pick<Profile, 'id'>,
  data: z.infer<typeof staffSchema> & { telegramId: number },
): Promise<StaffActionState> {
  const phone = normalizePhone(data.phone);
  if (!phone) return { error: 'invalidPhone', fieldErrors: { phone: 'invalidPhone' } };

  const tempPassword = generateTempPassword();

  let createdUid: string;
  try {
    // profiles.id is a uuid column (carried over from the old Supabase
    // auth.users.id, which was always a real UUID) — Identity Platform's
    // own auto-generated uid is a 28-char non-UUID string, so leaving this
    // unset made every new-staff insert below fail with "invalid input
    // syntax for type uuid" and roll back the just-created auth user. A
    // caller-supplied UUID satisfies both: it's what the profiles insert
    // needs, and Identity Platform accepts any string up to 128 chars as
    // a uid.
    const user = await createIdentityUser({
      uid: randomUUID(),
      email: phoneToSyntheticEmail(phone),
      password: tempPassword,
      role: data.role,
      mustChangePassword: true,
    });
    createdUid = user.uid;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { error: message.includes('already exists') ? 'phoneTaken' : 'createFailed' };
  }

  try {
    await sql`
      insert into profiles (id, phone, first_name, last_name, date_of_birth, role, telegram_id, created_by)
      values (${createdUid}, ${phone}, ${data.firstName}, ${data.lastName}, ${data.dateOfBirth}, ${data.role}, ${data.telegramId}, ${actingProfile.id})
    `;
  } catch {
    await deleteIdentityUser(createdUid);
    return { error: 'createFailed' };
  }

  // Mirrors the welcome message telegram-bot-handlers.ts sends when someone
  // self-links via /start — the Telegram ID is now collected up front
  // instead of that deep-link flow, so this is the only place left that
  // would ever say "you're connected" to a newly created account. A
  // delivery failure (bad id, bot blocked) must never fail account
  // creation itself, same reasoning as every other Telegram send in this
  // app — the account is already created either way.
  try {
    await sendTelegramMessage(
      data.telegramId,
      `✅ Xush kelibsiz, ${data.firstName}! Telegram hisobingiz Persons Education platformasiga ulandi. Endi muhim bildirishnomalarni shu yerda olasiz.`,
    );
  } catch (error) {
    console.error('Telegram welcome message failed:', error instanceof Error ? error.message : error);
  }

  logSystemAction('staff.create', `Created staff member ${data.firstName} ${data.lastName} (${data.role})`);

  revalidatePath('/[locale]/staff', 'page');
  return { tempPassword, userId: createdUid };
}

export async function createStaffAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireStaffManager());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = staffSchema.extend({ telegramId: telegramIdField }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };
  if (isProtectedRole(parsed.data.role) && actingProfile.role !== 'ceo') {
    return { error: assignRoleError(parsed.data.role) };
  }

  return createStaffRow(actingProfile, parsed.data);
}

/** Attaches an avatar already uploaded (via requestAvatarUploadUrlAction) to a staff profile. */
export async function attachAvatarAction(
  targetUserId: string,
  avatarPath: string,
): Promise<{ error?: string }> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireStaffManager());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  // requestAvatarUploadUrlAction already gated the upload itself on this
  // same check — re-checked here since this action, called separately, is
  // otherwise an unguarded path to overwrite a protected account's avatar.
  const [target] = await sql<{ role: string }[]>`select role from profiles where id = ${targetUserId}`;
  if (
    target &&
    targetUserId !== actingProfile.id &&
    isProtectedRole(target.role) &&
    actingProfile.role !== 'ceo'
  ) {
    return { error: manageRoleError(target.role) };
  }

  // Avatars are served through the app's own signed-read proxy rather than
  // a public bucket URL — bucket objects here are private (no public ACLs),
  // so what's stored is just the object path; a fresh signed read URL is
  // minted wherever it's displayed.
  await sql`update profiles set avatar_url = ${avatarPath} where id = ${targetUserId}`;

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

const updateSchema = staffSchema.extend({
  id: z.string().uuid(),
  avatarPath: z.string().optional().or(z.literal('')),
  // Only meaningful (and only ever submitted by the form) when role is
  // 'internship' — set directly by whichever admin is editing, unlike
  // teacher_level which only ever changes through the Self-Development
  // review flow.
  internshipLevel: z.enum(INTERNSHIP_LEVELS as [string, ...string[]]).optional(),
});

export async function updateStaffAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireStaffManager());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput', fieldErrors: fieldErrorCodes(parsed.error) };

  const [target] = await sql<{ role: string; phone: string }[]>`select role, phone from profiles where id = ${parsed.data.id}`;
  if (!target) return { error: 'notFound' };
  const isSelf = parsed.data.id === actingProfile.id;
  if (!isSelf && isProtectedRole(target.role) && actingProfile.role !== 'ceo') {
    return { error: manageRoleError(target.role) };
  }
  // Only a genuine role *change* into ceo/admin_manager is blocked — an
  // admin_manager editing their own profile still resubmits their current
  // (unchanged) role through this same form field.
  if (
    parsed.data.role !== target.role &&
    isProtectedRole(parsed.data.role) &&
    actingProfile.role !== 'ceo'
  ) {
    return { error: assignRoleError(parsed.data.role) };
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: 'invalidPhone', fieldErrors: { phone: 'invalidPhone' } };

  // Login is keyed by a synthetic email derived from phone (see
  // lib/auth/phone.ts) — the Identity Platform account must be kept in
  // sync whenever the phone actually changes, or the employee ends up
  // locked out under both the old and new number. Done before the SQL
  // update below so a conflict (someone else already has this number)
  // fails loudly instead of leaving the profile row pointing at a phone
  // that can't log in.
  if (phone !== target.phone) {
    try {
      await updateIdentityUserEmail(parsed.data.id, phoneToSyntheticEmail(phone));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return message.includes('already exists')
        ? { error: 'phoneTaken', fieldErrors: { phone: 'invalidPhone' } }
        : { error: 'updateFailed' };
    }
  }

  const internshipLevel =
    parsed.data.role === 'internship' && parsed.data.internshipLevel
      ? (parsed.data.internshipLevel as InternshipLevel)
      : null;

  await sql`
    update profiles set
      first_name = ${parsed.data.firstName},
      last_name = ${parsed.data.lastName},
      phone = ${phone},
      date_of_birth = ${parsed.data.dateOfBirth},
      role = ${parsed.data.role},
      avatar_url = coalesce(${parsed.data.avatarPath || null}, avatar_url),
      internship_level = coalesce(${internshipLevel}, internship_level)
    where id = ${parsed.data.id}
  `;

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
    ({ profile: actingProfile } = await requireStaffManager());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.id === actingProfile.id) return { error: 'cannotDeactivateSelf' };

  const [target] = await sql<{ role: string; is_active: boolean }[]>`
    select role, is_active from profiles where id = ${parsed.data.id}
  `;
  if (!target) return { error: 'notFound' };
  if (isProtectedRole(target.role) && actingProfile.role !== 'ceo') {
    return { error: manageRoleError(target.role) };
  }

  await sql`update profiles set is_active = ${!target.is_active} where id = ${parsed.data.id}`;

  logSystemAction(
    target.is_active ? 'staff.deactivate' : 'staff.activate',
    `${target.is_active ? 'Deactivated' : 'Reactivated'} staff member ${parsed.data.id}`,
  );

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

/** Permanent deletion, CEO-only (self-delete blocked too). Deletes the
 * Identity Platform account and the profiles row as two explicit steps —
 * unlike Supabase's auth.users cascade, Cloud SQL has no FK back to
 * Identity Platform, so nothing here is atomic across the two systems. If
 * the profile delete below fails after the identity delete above succeeds,
 * the account is unrecoverable-by-login but its row lingers; that failure
 * mode is judged acceptable (CEO-only, rare, and the row itself is harmless
 * with no matching login) rather than adding compensating-transaction
 * complexity for a permanent-delete action. Target's name/role is captured
 * before the delete for the audit log, since the row won't exist to query
 * afterward. */
export async function deleteStaffAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireAdmin());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.id === actingProfile.id) return { error: 'cannotDeleteSelf' };

  const [target] = await sql<{ first_name: string; last_name: string; role: string }[]>`
    select first_name, last_name, role from profiles where id = ${parsed.data.id}
  `;
  if (!target) return { error: 'notFound' };
  if (isProtectedRole(target.role) && actingProfile.role !== 'ceo') {
    return { error: manageRoleError(target.role) };
  }

  try {
    await deleteIdentityUser(parsed.data.id);
  } catch {
    return { error: 'deleteFailed' };
  }
  await sql`delete from profiles where id = ${parsed.data.id}`;

  logSystemAction('staff.delete', `Deleted staff member ${target.first_name} ${target.last_name} (${target.role})`);

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

export async function resetStaffPasswordAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireStaffManager());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const [target] = await sql<{ role: string }[]>`select role from profiles where id = ${parsed.data.id}`;
  if (!target) return { error: 'notFound' };
  if (
    parsed.data.id !== actingProfile.id &&
    isProtectedRole(target.role) &&
    actingProfile.role !== 'ceo'
  ) {
    return { error: manageRoleError(target.role) };
  }

  const tempPassword = generateTempPassword();
  try {
    await setUserPassword(parsed.data.id, tempPassword);
  } catch {
    return { error: 'updateFailed' };
  }

  await sql`update profiles set must_change_password = true where id = ${parsed.data.id}`;
  // Revoking alone isn't enough: it forces a fresh login, but a fresh
  // login's session cookie is minted from an ID token that carries
  // whatever custom claims were *last set* on the account — which, without
  // this call, would still be the stale mustChangePassword:false from
  // their previous successful password change. The claim and the DB
  // column must always be updated together (see setPasswordAction), or
  // proxy.ts's fast-path check and the page's own live-DB check disagree
  // and produce the same /dashboard <-> /set-password redirect loop.
  await setUserClaims(parsed.data.id, { role: target.role, mustChangePassword: true });
  // Also revoke any already-live session for the target — otherwise an
  // existing (pre-reset) cookie keeps working right up until it would
  // naturally expire, up to 14 days, letting them skip the password change
  // this reset was meant to force.
  await revokeUserSessions(parsed.data.id);

  revalidatePath('/[locale]/staff', 'page');
  return { tempPassword };
}

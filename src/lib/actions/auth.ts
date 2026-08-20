'use server';

import { z } from 'zod';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { cookies } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from '@/lib/gcp/credentials';
import {
  signInWithPassword,
  createSessionCookie,
  reissueSessionCookie,
  revokeUserSessions,
  getCurrentUser,
  SESSION_COOKIE_NAME,
} from '@/lib/gcp/session';
import { setUserClaims } from '@/lib/gcp/adminAuth';
import { sql } from '@/lib/db/client';
import { normalizePhone, phoneToSyntheticEmail } from '@/lib/auth/phone';

export type AuthActionState = { error: string } | undefined;

const loginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: 'invalidPhone' };

  let destination: string;
  try {
    const signInResult = await signInWithPassword(phoneToSyntheticEmail(phone), parsed.data.password);
    if (!signInResult) return { error: 'invalidCredentials' };

    const decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(signInResult.idToken);
    const [profile] = await sql<{ must_change_password: boolean; is_active: boolean }[]>`
      select must_change_password, is_active from profiles where id = ${decoded.uid}
    `;

    if (profile && !profile.is_active) {
      await revokeUserSessions(decoded.uid);
      return { error: 'accountDeactivated' };
    }

    const sessionCookie = await createSessionCookie(signInResult.idToken);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 14,
      path: '/',
    });

    destination = profile?.must_change_password ? '/set-password' : '/dashboard';
  } catch (err) {
    // Network/config failures (wrong project/key, DNS, timeout, etc.) throw
    // instead of returning { error }, which would otherwise leave the
    // submit button stuck on "loading" forever with no feedback.
    if (err instanceof Error && (err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    console.error('loginAction failed unexpectedly', err);
    return { error: 'unexpectedError' };
  }

  // Compute the final destination here rather than always redirecting to
  // /dashboard: a redirect() encountered while rendering the target of
  // another redirect() doesn't reliably update the browser URL.
  redirect({ href: destination, locale: await getLocale() });
}

const setPasswordSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwordMismatch',
  });

export async function setPasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = setPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const isMismatch = parsed.error.issues.some((issue) => issue.message === 'passwordMismatch');
    return { error: isMismatch ? 'passwordMismatch' : 'passwordTooShort' };
  }

  try {
    const user = await getCurrentUser();
    if (!user) redirect({ href: '/login', locale: await getLocale() });

    // Updating the password doesn't invalidate the caller's current
    // session cookie (verifySessionCookie only checks the cookie's own
    // signature/expiry, not the account's current password), so — same
    // as the original Supabase behavior — the user stays logged in and
    // lands on /dashboard rather than being forced to log back in.
    await getAuth(getFirebaseAdminApp()).updateUser(user!.uid, { password: parsed.data.password });
    await sql`update profiles set must_change_password = false where id = ${user!.uid}`;
    await setUserClaims(user!.uid, { role: user!.role ?? 'teacher', mustChangePassword: false });
    // A claim update alone doesn't touch the *current* session cookie — it's
    // only baked in at mint time — so without reissuing it here, proxy.ts's
    // fast-path check (reads the claim) and this page's own live-DB check
    // permanently disagree for the rest of this cookie's 14-day life: the
    // page sees must_change_password=false and sends /dashboard onward, the
    // middleware still sees the stale mustChangePassword:true claim and
    // sends it right back to /set-password — an infinite redirect loop.
    const sessionCookie = await reissueSessionCookie(user!.uid);
    (await cookies()).set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 14,
      path: '/',
    });
  } catch (err) {
    if (err instanceof Error && (err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    console.error('setPasswordAction failed unexpectedly', err);
    return { error: 'unexpectedError' };
  }

  redirect({ href: '/dashboard', locale: await getLocale() });
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await revokeUserSessions(user.uid);

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect({ href: '/login', locale: await getLocale() });
}

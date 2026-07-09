'use server';

import { z } from 'zod';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
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
    const supabase = await createClient();
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: phoneToSyntheticEmail(phone),
      password: parsed.data.password,
    });
    if (error) return { error: 'invalidCredentials' };

    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password, is_active')
      .eq('id', signInData.user.id)
      .single();

    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return { error: 'accountDeactivated' };
    }

    destination = profile?.must_change_password ? '/set-password' : '/dashboard';
  } catch (err) {
    // Network/config failures (wrong Supabase URL/key, DNS, timeout, etc.)
    // throw instead of returning { error }, which would otherwise leave the
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect({ href: '/login', locale: await getLocale() });

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (updateError) return { error: 'updateFailed' };

    await supabase.from('profiles').update({ must_change_password: false }).eq('id', user!.id);
  } catch (err) {
    if (err instanceof Error && (err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    console.error('setPasswordAction failed unexpectedly', err);
    return { error: 'unexpectedError' };
  }

  redirect({ href: '/dashboard', locale: await getLocale() });
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: '/login', locale: await getLocale() });
}

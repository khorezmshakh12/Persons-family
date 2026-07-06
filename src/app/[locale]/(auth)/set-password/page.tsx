import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { AuthCard } from '@/components/auth/auth-card';

export const dynamic = 'force-dynamic';

export default async function SetPasswordPage() {
  const { user, profile } = await getAuthState();
  const locale = await getLocale();
  if (!user) redirect({ href: '/login', locale });
  if (!profile?.must_change_password) redirect({ href: '/dashboard', locale });

  const t = await getTranslations('auth');

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <AuthCard title={t('setPasswordTitle')} subtitle={t('setPasswordSubtitle')}>
        <SetPasswordForm />
      </AuthCard>
    </div>
  );
}

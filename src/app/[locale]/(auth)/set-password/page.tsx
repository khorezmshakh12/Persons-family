import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function SetPasswordPage() {
  const { user, profile } = await getAuthState();
  const locale = await getLocale();
  if (!user) redirect({ href: '/login', locale });
  if (!profile?.must_change_password) redirect({ href: '/dashboard', locale });

  const t = await getTranslations('auth');

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{t('setPasswordTitle')}</CardTitle>
          <CardDescription>{t('setPasswordSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

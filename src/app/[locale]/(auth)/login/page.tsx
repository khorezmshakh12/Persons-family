import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { user, profile } = await getAuthState();
  const locale = await getLocale();
  if (user) redirect({ href: profile?.must_change_password ? '/set-password' : '/dashboard', locale });

  const t = await getTranslations('auth');
  const { reason } = await searchParams;
  const suspended = reason === 'suspended';

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
      {suspended && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('errors.accountDeactivated')}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('loginTitle')}</CardTitle>
          <CardDescription>{t('loginSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}

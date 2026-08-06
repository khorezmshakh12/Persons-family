import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { LoginForm } from '@/components/auth/login-form';
import { AuthCard } from '@/components/auth/auth-card';

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
    <>
      <div className="flex w-full max-w-md flex-col gap-4">
        {suspended && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-center text-sm text-red-200 shadow-sm backdrop-blur-sm">
            {t('errors.accountDeactivated')}
          </div>
        )}
        <AuthCard tagline={t('tagline')} title={t('loginTitle')} subtitle={t('loginSubtitle')}>
          <LoginForm />
        </AuthCard>
      </div>
      <span className="fixed right-8 bottom-6 text-sm font-light tracking-widest text-white/50 italic opacity-90 select-none pointer-events-none [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
        Unlock Your Potential
      </span>
    </>
  );
}

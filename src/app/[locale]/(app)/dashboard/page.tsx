import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';

// User-specific and cookie-driven — never attempt to prerender this route.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const { profile } = await getAuthState();

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-start gap-2 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      {profile && (
        <>
          <p className="text-muted-foreground">{t('greeting', { name: profile.first_name })}</p>
          <p className="text-muted-foreground">{t(`roleWelcome.${profile.role}`)}</p>
        </>
      )}
    </div>
  );
}

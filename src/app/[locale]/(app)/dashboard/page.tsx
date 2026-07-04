import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from '@/components/auth/logout-button';

// User-specific and cookie-driven — never attempt to prerender this route.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('first_name,last_name,role,phone')
        .eq('id', user.id)
        .single()
    : { data: null };

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      {profile && (
        <p className="text-muted-foreground">
          {profile.first_name} {profile.last_name} — {profile.role} — {profile.phone}
        </p>
      )}
      <LogoutButton />
    </div>
  );
}

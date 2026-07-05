import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { StarRatingDisplay } from '@/components/staff/star-rating-display';
import { formatUZS } from '@/lib/format-currency';

// User-specific and cookie-driven — never attempt to prerender this route.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const { user, profile } = await getAuthState();

  const supabase = await createClient();
  const { data: performance } = user
    ? await supabase.from('staff_performance').select('*').eq('staff_id', user.id).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16">
      <div className="flex flex-col items-start gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {profile && (
          <>
            <p className="text-muted-foreground">{t('greeting', { name: profile.first_name })}</p>
            <p className="text-muted-foreground">{t(`roleWelcome.${profile.role}`)}</p>
          </>
        )}
      </div>

      <div className="bg-card flex w-full max-w-md flex-col gap-4 rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-medium">{t('performance.title')}</h2>
        {performance ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">{t('performance.rating')}</span>
              <StarRatingDisplay value={performance.rating} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('performance.bonus')}</span>
              <span className="font-medium">{formatUZS(performance.bonus)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('performance.penalty')}</span>
              <span className="font-medium">{formatUZS(performance.penalty)}</span>
            </div>
            {performance.notes && (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">{t('performance.notes')}</span>
                <p className="whitespace-pre-wrap">{performance.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t('performance.noData')}</p>
        )}
      </div>
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export async function HeroCard({ firstName, isAdmin }: { firstName: string; isAdmin: boolean }) {
  const t = await getTranslations('dashboard');

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-gradient-to-br from-teal-50 via-white to-white p-6 shadow-sm dark:border-slate-800 dark:from-teal-950/40 dark:via-slate-900 dark:to-slate-900">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('hero.title')}</h1>
        <p className="text-muted-foreground">{t('hero.subtitle', { name: firstName })}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/lesson-plans" className={cn(buttonVariants({ variant: 'default' }))}>
          {t('hero.viewWeeklyPlan')}
        </Link>
        <a
          href={isAdmin ? '#team-results' : '#weekly-progress'}
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          {t('hero.checkResults')}
        </a>
      </div>
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export async function HeroCard({ firstName, isAdmin }: { firstName: string; isAdmin: boolean }) {
  const t = await getTranslations('dashboard');

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t('hero.title')}</h1>
        <p className="text-white/70">{t('hero.subtitle', { name: firstName })}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/lesson-plans" className={cn(buttonVariants({ variant: 'default' }))}>
          {t('hero.viewWeeklyPlan')}
        </Link>
        <a
          href={isAdmin ? '#team-results' : '#weekly-progress'}
          className={cn(buttonVariants({ variant: 'outline' }), 'border-white/30 bg-white/10 text-white hover:bg-white/20')}
        >
          {t('hero.checkResults')}
        </a>
      </div>
    </div>
  );
}

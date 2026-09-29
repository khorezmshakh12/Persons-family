import { getTranslations } from 'next-intl/server';
import { NotebookPen } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { BTN_PRIMARY, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

/** Everyone but the CEO must hand in a monthly self-development report —
 * shown on the dashboard until this month's is in. */
export async function SelfDevReminder() {
  const t = await getTranslations('selfDevReminder');
  return (
    <section className={cn(SURFACE_CARD, 'au-highlight flex flex-col gap-3 border-l-4 border-l-au-accent p-5 sm:flex-row sm:items-center')}>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
        <NotebookPen className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold text-au-ink">{t('title')}</h2>
        <p className="text-sm text-au-muted">{t('body')}</p>
      </div>
      <Link href="/self-development" className={cn(BTN_PRIMARY, 'shrink-0')}>
        {t('cta')}
      </Link>
    </section>
  );
}

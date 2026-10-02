import { getTranslations } from 'next-intl/server';
import { NotebookPen } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/** Everyone but the CEO must hand in a monthly self-development report —
 * shown on the dashboard until this month's is in. */
export async function SelfDevReminder() {
  const t = await getTranslations('selfDevReminder');
  // A slim one-line strip: a nudge, not a second hero competing with the
  // dashboard's own greeting.
  return (
    <section className="au-highlight relative flex items-center gap-3 overflow-hidden rounded-au-ctl border border-au-line bg-au-accent-soft px-4 py-2.5">
      <NotebookPen className="size-4 shrink-0 text-au-accent-text" strokeWidth={1.75} aria-hidden />
      <p className="min-w-0 flex-1 truncate text-sm text-au-ink">
        <span className="font-semibold">{t('title')}</span>
        <span className="hidden text-au-muted sm:inline"> — {t('body')}</span>
      </p>
      <Link href="/self-development" className="shrink-0 text-sm font-semibold text-au-accent-text hover:underline">
        {t('cta')} →
      </Link>
    </section>
  );
}

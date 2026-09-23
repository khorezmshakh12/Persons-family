import type { ReactNode } from 'react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Check, CircleAlert, ShoppingBag, Star, TrendingDown } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { CARD_LINK, CARD_TITLE, CHIP_ACCENT, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { ActivityItem } from '@/lib/aurora-dashboard';

const ICON: Record<ActivityItem['kind'], { icon: typeof Check; tone: string }> = {
  stars: { icon: Star, tone: 'text-au-accent-text' },
  starsLost: { icon: TrendingDown, tone: 'text-au-bad' },
  taskDone: { icon: Check, tone: 'text-au-ok' },
  issue: { icon: CircleAlert, tone: 'text-au-bad' },
  order: { icon: ShoppingBag, tone: 'text-au-muted' },
};

/** Timeline of the latest events: round status icon, 1px connector line. */
export async function ActivityFeed({
  items,
  href,
  className,
}: {
  items: ActivityItem[] | null;
  href: string;
  className?: string;
}) {
  const t = await getTranslations('aurora');
  const format = await getFormatter();
  const now = new Date();

  const text = (item: ActivityItem) => {
    const b = (chunks: ReactNode) => <b className="font-semibold text-au-ink">{chunks}</b>;
    const name = item.name;
    switch (item.kind) {
      case 'stars':
        return t.rich('actStars', { b, name, delta: `+${item.delta}` });
      case 'starsLost':
        return t.rich('actStarsLost', { b, name, delta: `${Math.abs(item.delta ?? 0)}` });
      case 'taskDone':
        return t.rich('actTaskDone', { b, name });
      case 'issue':
        return t.rich('actIssue', { b, name });
      case 'order':
        return (
          <>
            {t.rich('actOrder', { b, name })}{' '}
            <span className={cn(CHIP_ACCENT, 'h-5 px-1.5 align-[1px] text-[11px] tabular-nums')}>
              {Math.abs(item.delta ?? 0)} ★
            </span>
          </>
        );
    }
  };

  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col p-5', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className={CARD_TITLE}>{t('activity')}</h2>
        <Link href={href} className={cn(CARD_LINK, 'shrink-0')}>
          {t('all')}
        </Link>
      </div>

      {!items || items.length === 0 ? (
        <p className="py-10 text-center text-sm text-au-muted">{t('activityEmpty')}</p>
      ) : (
        <ol className="flex flex-col">
          {items.map((item, i) => {
            const { icon: Icon, tone } = ICON[item.kind];
            return (
              <li key={item.id} className="relative flex gap-3 py-[9px]">
                {i < items.length - 1 && (
                  <span aria-hidden className="absolute top-10 -bottom-1 left-[15px] w-px bg-au-line" />
                )}
                <span
                  className={cn(
                    'grid size-[31px] shrink-0 place-items-center rounded-full border border-au-line bg-au-card-2',
                    tone,
                  )}
                >
                  <Icon className="size-[15px]" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] leading-[19px] text-au-ink">{text(item)}</p>
                  <p className="mt-0.5 truncate text-xs text-au-muted">
                    {format.relativeTime(new Date(item.at), now)}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

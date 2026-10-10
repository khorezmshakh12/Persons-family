'use client';

import { Megaphone } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { CardCarousel } from '@/components/ui/card-carousel';
import { cn } from '@/lib/utils';

export type NewsSlide = { id: string; title: string; content: string; date: string };

/** Company news on the dashboard as a sliding card carousel. `flat` is the
 * owner's "yassi to'rtburchak" (2026-10-06): a low, wide strip under the star
 * rating — one line of title + date, two lines of text. */
export function NewsSliderView({
  items,
  title,
  allLabel,
  flat = false,
  className,
}: {
  items: NewsSlide[];
  title: string;
  allLabel: string;
  flat?: boolean;
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <section className={cn('flex min-w-0 flex-col gap-2.5', className)} aria-label={title}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
          <Megaphone className="size-4" />
        </span>
        <h2 className="flex-1 text-base font-bold text-au-ink">{title}</h2>
        <Link href="/company-news" className="shrink-0 text-xs font-semibold text-au-accent-text hover:underline">
          {allLabel} →
        </Link>
      </div>
      <CardCarousel label={title} interval={4500} peek={!flat || items.length > 1}>
        {items.map((n) => (
          <Link
            key={n.id}
            href="/company-news"
            draggable={false}
            className={cn(
              'flex h-full flex-col rounded-au-card border border-au-line bg-au-card shadow-au-card transition-colors hover:bg-au-card-2',
              flat ? 'min-h-[92px] justify-center gap-1 px-5 py-3.5' : 'min-h-[132px] gap-1.5 p-5',
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="line-clamp-1 text-[15px] font-bold text-au-ink">{n.title}</span>
              <span className="shrink-0 text-[11px] text-au-faint">{n.date}</span>
            </div>
            <p className={cn('text-[13px] leading-relaxed text-au-muted [overflow-wrap:anywhere]', flat ? 'line-clamp-2' : 'line-clamp-3')}>
              {n.content}
            </p>
          </Link>
        ))}
      </CardCarousel>
    </section>
  );
}

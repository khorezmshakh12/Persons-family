'use client';

import { Megaphone } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { CardCarousel } from '@/components/ui/card-carousel';

export type NewsSlide = { id: string; title: string; content: string; date: string };

/** Latest company news at the top of the dashboard as a sliding card
 * carousel (owner, 2026-10-06 — it used to be a one-line text ticker). */
export function NewsSliderView({ items, title, allLabel }: { items: NewsSlide[]; title: string; allLabel: string }) {
  if (!items.length) return null;
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={title}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
          <Megaphone className="size-4" />
        </span>
        <h2 className="flex-1 text-base font-bold text-au-ink">{title}</h2>
        <Link href="/company-news" className="shrink-0 text-xs font-semibold text-au-accent-text hover:underline">
          {allLabel} →
        </Link>
      </div>
      <CardCarousel label={title} interval={4500}>
        {items.map((n) => (
          <Link
            key={n.id}
            href="/company-news"
            draggable={false}
            className="flex h-full min-h-[132px] flex-col gap-1.5 rounded-au-card border border-au-line bg-au-card p-5 shadow-au-card transition-colors hover:bg-au-card-2"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="line-clamp-1 text-[15px] font-bold text-au-ink">{n.title}</span>
              <span className="shrink-0 text-[11px] text-au-faint">{n.date}</span>
            </div>
            <p className="line-clamp-3 text-[13px] leading-relaxed text-au-muted [overflow-wrap:anywhere]">{n.content}</p>
          </Link>
        ))}
      </CardCarousel>
    </section>
  );
}

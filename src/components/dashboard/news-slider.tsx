'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export type NewsSlide = { id: string; title: string; content: string; date: string };

/** Latest company news at the top of the dashboard, auto-advancing every
 * 3 s (paused on hover / focus, and when the tab is hidden). */
export function NewsSliderView({ items, title, allLabel }: { items: NewsSlide[]; title: string; allLabel: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = items.length;

  useEffect(() => {
    if (n < 2 || paused) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setI((x) => (x + 1) % n);
    }, 3000);
    return () => clearInterval(id);
  }, [n, paused]);

  if (!n) return null;
  const cur = items[i % n];
  return (
    <section
      className="relative overflow-hidden rounded-au-card border border-au-line bg-au-card shadow-au-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label={title}
    >
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-au-accent-soft text-au-accent-text">
          <Megaphone className="size-4" />
        </span>
        <div className="relative min-w-0 flex-1" aria-live={paused ? 'polite' : 'off'}>
          <div key={cur.id} className="animate-fade-in-up">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-bold text-au-ink">{cur.title}</span>
              <span className="shrink-0 text-[11px] text-au-faint">{cur.date}</span>
            </div>
            <p className="truncate text-[13px] text-au-muted">{cur.content}</p>
          </div>
        </div>
        {n > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              className="grid size-7 place-items-center rounded-full text-au-muted hover:bg-au-card-2"
              aria-label="Oldingi"
              onClick={() => setI((x) => (x - 1 + n) % n)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              className="grid size-7 place-items-center rounded-full text-au-muted hover:bg-au-card-2"
              aria-label="Keyingi"
              onClick={() => setI((x) => (x + 1) % n)}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
        <Link href="/company-news" className="hidden shrink-0 text-xs font-semibold text-au-accent-text hover:underline sm:block">
          {allLabel} →
        </Link>
      </div>
      {n > 1 && (
        <div className="flex gap-1 px-5 pb-2.5">
          {items.map((it, k) => (
            <button
              key={it.id}
              aria-label={`${k + 1} / ${n}`}
              onClick={() => setI(k)}
              className={cn('h-1 flex-1 overflow-hidden rounded-full bg-au-line/70')}
            >
              <span
                key={k === i % n ? `on-${i}-${paused}` : 'off'}
                className={cn(
                  'block h-full rounded-full bg-au-accent',
                  k < i % n ? 'w-full' : k === i % n ? (paused ? 'w-full' : 'news-progress') : 'w-0',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

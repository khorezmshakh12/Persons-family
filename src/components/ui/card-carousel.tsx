'use client';

import { Children, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One-card-at-a-time slider (owner, 2026-10-05: news as a carousel).
 * - Native horizontal scroll-snap track → touch swipe works out of the box.
 * - ‹ › buttons and one dot per slide; ArrowLeft / ArrowRight on the track.
 * - Auto-advances every `interval` ms and loops; pauses on hover, focus,
 *   touch, a hidden tab and prefers-reduced-motion.
 * Each child is one slide and takes the full width of the track.
 */
export function CardCarousel({
  children,
  interval = 6000,
  label = 'Yangiliklar',
  className,
}: {
  children: React.ReactNode;
  interval?: number;
  label?: string;
  className?: string;
}) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback(
    (i: number) => {
      const track = trackRef.current;
      if (!track || count === 0) return;
      const next = (i + count) % count;
      track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
    },
    [count],
  );

  // The active slide follows the scroll position (buttons, swipe, keys).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (track.clientWidth) setIndex(Math.round(track.scrollLeft / track.clientWidth));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      track.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') goTo(index + 1);
    }, interval);
    return () => clearInterval(id);
  }, [count, paused, index, interval, goTo]);

  if (count === 0) return null;
  if (count === 1) return <div className={className}>{slides[0]}</div>;

  const arrow = 'absolute top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-au-line bg-au-card text-au-ink shadow-au-card transition hover:scale-105 hover:bg-au-card-2 max-sm:hidden';
  return (
    <section
      className={cn('flex min-w-0 flex-col gap-3', className)}
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className="relative">
        <div
          ref={trackRef}
          tabIndex={0}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-au-card outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              goTo(index - 1);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              goTo(index + 1);
            }
          }}
        >
          {slides.map((s, i) => (
            <div
              key={i}
              className="w-full shrink-0 snap-start snap-always"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}`}
              aria-hidden={i !== index}
            >
              {s}
            </div>
          ))}
        </div>
        <button type="button" className={cn(arrow, '-left-3')} onClick={() => goTo(index - 1)} aria-label="Oldingi">
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" className={cn(arrow, '-right-3')} onClick={() => goTo(index + 1)} aria-label="Keyingi">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`${i + 1}-yangilik`}
            aria-current={i === index}
            className={cn('h-2 rounded-full transition-all', i === index ? 'w-6 bg-au-accent' : 'w-2 bg-au-line hover:bg-au-faint')}
          />
        ))}
      </div>
    </section>
  );
}

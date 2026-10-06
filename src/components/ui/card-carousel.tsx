'use client';

import { Children, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Card carousel (owner, 2026-10-06: news must work as a real carousel).
 *
 * The track slides with a CSS transform, so every change is a visible
 * sideways motion; the next card peeks in at the edge. It auto-plays every
 * `interval` ms with a progress bar, loops, and only pauses while a mouse
 * hovers it or a finger is dragging — playback always resumes afterwards
 * (the previous version paused for good after the first touch or arrow
 * click). Swipe / drag with pointer events, ‹ › buttons, dots, ← → keys.
 */
export function CardCarousel({
  children,
  interval = 5000,
  label = 'Yangiliklar',
  peek = true,
  className,
}: {
  children: React.ReactNode;
  interval?: number;
  label?: string;
  /** Show a slice of the next card at the right edge (desktop). */
  peek?: boolean;
  className?: string;
}) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; dx: number } | null>(null);
  const [reduced, setReduced] = useState(false);
  const [tick, setTick] = useState(0); // restarts the progress bar
  const viewRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // A swipe ends in a click; swallow it so a dragged card's link doesn't open.
  const moved = useRef(false);
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const goTo = useCallback(
    (i: number) => {
      if (count === 0) return;
      setIndex(((i % count) + count) % count);
      setTick((t) => t + 1);
    },
    [count],
  );

  const playing = count > 1 && !hover && !drag && !reduced;
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (document.visibilityState === 'visible') goTo(index + 1);
      else setTick((t) => t + 1); // hidden tab: try again later
    }, interval);
    return () => clearTimeout(id);
  }, [playing, index, interval, goTo, tick]);

  if (count === 0) return null;
  if (count === 1) return <div className={className}>{slides[0]}</div>;

  // Each slide is 100% wide on phones; on wider screens 88% so the next
  // card peeks in and the motion reads as a carousel.
  const slideW = peek ? 'w-full sm:w-[88%]' : 'w-full';
  const step = width ? (peek && width >= 640 ? width * 0.88 + 16 : width + 16) : 0;
  const offset = -index * step + (drag?.dx ?? 0);

  const end = () => {
    if (!drag) return;
    const dx = drag.dx;
    moved.current = Math.abs(dx) > 6;
    setDrag(null);
    if (Math.abs(dx) > 50) goTo(index + (dx < 0 ? 1 : -1));
    else setTick((t) => t + 1);
  };

  const arrow =
    'absolute top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-au-line bg-au-card text-au-ink shadow-au-card transition hover:scale-105 hover:bg-au-card-2';
  return (
    <section
      className={cn('flex min-w-0 flex-col gap-3', className)}
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') goTo(index - 1);
        else if (e.key === 'ArrowRight') goTo(index + 1);
      }}
    >
      <div className="relative">
        <div
          ref={viewRef}
          className="touch-pan-y overflow-hidden rounded-au-card"
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            setDrag({ x0: e.clientX, dx: 0 });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0 })}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          onClickCapture={(e) => {
            if (moved.current) {
              e.preventDefault();
              e.stopPropagation();
              moved.current = false;
            }
          }}
          onDragStart={(e) => e.preventDefault()}
        >
          <div
            className={cn('flex gap-4', !drag && 'transition-transform duration-500 ease-[cubic-bezier(.22,.8,.24,1)]')}
            style={{ transform: `translate3d(${offset}px,0,0)` }}
          >
            {slides.map((s, i) => (
              <div
                key={i}
                className={cn(slideW, 'shrink-0 transition-opacity duration-500', i !== index && 'opacity-60')}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} / ${count}`}
                aria-hidden={i !== index}
                onClickCapture={(e) => {
                  // A tap on the peeking card brings it forward instead of
                  // following a link inside it.
                  if (i !== index) {
                    e.preventDefault();
                    e.stopPropagation();
                    goTo(i);
                  }
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>
        <button type="button" className={cn(arrow, '-left-3 max-sm:left-1 max-sm:size-8')} onClick={() => goTo(index - 1)} aria-label="Oldingi">
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" className={cn(arrow, '-right-3 max-sm:right-1 max-sm:size-8')} onClick={() => goTo(index + 1)} aria-label="Keyingi">
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
            className={cn('relative h-2 overflow-hidden rounded-full transition-all', i === index ? 'w-8 bg-au-line' : 'w-2 bg-au-line hover:bg-au-faint')}
          >
            {i === index && (
              <span
                key={`${index}-${tick}-${playing}`}
                className="absolute inset-y-0 left-0 rounded-full bg-au-accent"
                style={
                  playing
                    ? { width: '100%', animation: `cc-progress ${interval}ms linear both` }
                    : { width: '100%' }
                }
              />
            )}
          </button>
        ))}
      </div>
      <style>{`@keyframes cc-progress{from{transform:translateX(-100%)}to{transform:translateX(0)}}`}</style>
    </section>
  );
}

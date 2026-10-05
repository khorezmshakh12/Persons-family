'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CardCarousel({
  children,
  itemCount,
}: {
  children: React.ReactNode;
  itemCount: number;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [paused, setPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const cardWidthRef = useRef<number>(0);

  // Update scroll state
  const updateScrollState = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);

    // Update active index based on scroll position
    if (cardWidthRef.current > 0) {
      const index = Math.round(scrollLeft / cardWidthRef.current);
      setActiveIndex(index);
    }
  };

  // Handle scroll
  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollAmount = container.clientWidth * 0.85; // Scroll by 85% width (approx one card on mobile)

    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  // IntersectionObserver to track card visibility
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const cards = container.querySelectorAll('[data-carousel-item]');
    if (cards.length === 0) return;

    // Get the width of first card to calculate scroll amounts
    const firstCard = cards[0] as HTMLElement;
    cardWidthRef.current = firstCard.offsetWidth;

    const observer = new IntersectionObserver(
      () => {
        updateScrollState();
      },
      { root: container, threshold: 0.1 }
    );

    cards.forEach((card) => observer.observe(card));
    updateScrollState();

    return () => {
      observer.disconnect();
    };
  }, [itemCount]);

  // Auto-advance every 5s
  useEffect(() => {
    if (itemCount < 2 || paused) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;

      const container = scrollContainerRef.current;
      if (!container) return;

      const { scrollLeft, scrollWidth, clientWidth } = container;
      const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 10;

      if (isAtEnd) {
        // Loop back to start
        container.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        scroll('right');
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [itemCount, paused]);

  // Update scroll state on scroll event
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateScrollState();
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Show no controls for 0-1 items
  if (itemCount < 2) {
    return (
      <div className="flex flex-col gap-4">
        {children}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Cards carousel"
    >
      {/* Scroll container with snap points */}
      <div className="relative overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scroll-smooth [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Carousel content"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              scroll('left');
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              scroll('right');
            }
          }}
          tabIndex={0}
        >
          {/* Cards are rendered by children and must have data-carousel-item attribute */}
          {children}
        </div>

        {/* Gradient fade on right (desktop) */}
        <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-au-bg from-100% to-transparent" />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        {/* Prev/Next buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full border border-au-line transition-colors',
              canScrollLeft
                ? 'bg-au-card text-au-ink hover:bg-au-card-2 cursor-pointer'
                : 'bg-au-card text-au-muted cursor-not-allowed opacity-50'
            )}
            aria-label="Previous"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full border border-au-line transition-colors',
              canScrollRight
                ? 'bg-au-card text-au-ink hover:bg-au-card-2 cursor-pointer'
                : 'bg-au-card text-au-muted cursor-not-allowed opacity-50'
            )}
            aria-label="Next"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Dots showing position */}
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: Math.max(0, itemCount - 2) }).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                if (scrollContainerRef.current && cardWidthRef.current) {
                  scrollContainerRef.current.scrollTo({
                    left: i * cardWidthRef.current,
                    behavior: 'smooth',
                  });
                }
              }}
              className={cn(
                'h-1.5 w-1.5 rounded-full border transition-all',
                Math.abs(i - activeIndex) < 2
                  ? 'border-au-accent bg-au-accent'
                  : 'border-au-line bg-au-line/50'
              )}
              aria-label={`Go to item ${i + 1}`}
            />
          ))}
        </div>

        <div className="w-24" /> {/* Spacer for alignment */}
      </div>
    </div>
  );
}

'use client';

import { cn } from '@/lib/utils';

/**
 * A handful of star glyphs that fly outward and fade — the celebratory beat
 * when a purchase lands.
 *
 * Deliberately hand-rolled (8 absolutely-positioned inline SVGs driven by one
 * `star-fly` keyframe) rather than pulling in a particle library for a
 * one-second flourish.
 *
 * Motion safety: this whole overlay is `pointer-events-none`, is only mounted
 * for the ~1s the celebration lasts, and contains no content — nothing here
 * can hide, displace or block anything the user needs. `prefers-reduced-motion`
 * hides `.star-particle` outright (globals.css).
 */

// Fixed offsets, not random: a deterministic spray renders identically on the
// server and the client, and eight of them already read as a burst.
const PARTICLES = [
  { dx: '-72px', dy: '-58px', delay: 0, size: 14 },
  { dx: '-34px', dy: '-86px', delay: 60, size: 10 },
  { dx: '6px', dy: '-96px', delay: 20, size: 16 },
  { dx: '48px', dy: '-78px', delay: 90, size: 11 },
  { dx: '82px', dy: '-44px', delay: 40, size: 13 },
  { dx: '-88px', dy: '-8px', delay: 120, size: 10 },
  { dx: '92px', dy: '4px', delay: 140, size: 12 },
  { dx: '-12px', dy: '-118px', delay: 170, size: 9 },
];

export function StarBurst({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-visible',
        className,
      )}
    >
      {PARTICLES.map((p, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={p.size}
          height={p.size}
          className="star-particle absolute text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.75)]"
          style={
            {
              '--star-dx': p.dx,
              '--star-dy': p.dy,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        >
          <path
            fill="currentColor"
            d="M12 2.5l2.6 6.1 6.6.6-5 4.3 1.5 6.5L12 16.6 6.3 20l1.5-6.5-5-4.3 6.6-.6z"
          />
        </svg>
      ))}
    </div>
  );
}

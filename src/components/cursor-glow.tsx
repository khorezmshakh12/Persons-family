'use client';

import { useEffect, useRef } from 'react';

/**
 * A soft radial glow that trails the pointer. Position updates are written
 * directly to CSS custom properties on rAF ticks rather than via React
 * state, so the effect never triggers a re-render on mouse move.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let x = 0;
    let y = 0;
    let scheduled = false;

    function apply() {
      scheduled = false;
      const el = ref.current;
      if (!el) return;
      el.style.setProperty('--glow-x', `${x}px`);
      el.style.setProperty('--glow-y', `${y}px`);
    }

    function handleMove(e: PointerEvent) {
      x = e.clientX;
      y = e.clientY;
      if (!scheduled) {
        scheduled = true;
        frame = requestAnimationFrame(apply);
      }
    }

    window.addEventListener('pointermove', handleMove);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9999] hidden dark:block"
      style={{
        background:
          'radial-gradient(600px circle at var(--glow-x, 50%) var(--glow-y, 50%), color-mix(in oklch, var(--brand) 14%, transparent), transparent 80%)',
      }}
    />
  );
}

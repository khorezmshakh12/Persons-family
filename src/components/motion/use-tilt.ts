'use client';

import { useEffect } from 'react';

/** Cards that tilt: KPI tiles, heroes, highlight cards — inside the motion scope only. */
const TILT_SELECTOR = "[data-motion='on'] :is(.au-kpi, .bg-au-hero, .au-highlight)";

/**
 * 3D tilt on pointer move. Transform-only (via CSS custom properties read
 * by `.au-tilted` in motion.css), mouse pointers only, off under reduced
 * motion or on devices without a fine hover pointer. One passive document
 * listener, rAF-throttled; never re-renders React.
 */
export function useTilt() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let current: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;

    function release(el: HTMLElement) {
      el.classList.remove('au-tilt-live');
      el.style.removeProperty('--au-rx');
      el.style.removeProperty('--au-ry');
    }

    function apply() {
      frame = 0;
      const e = last;
      if (!e) return;
      const target = e.target instanceof Element ? (e.target.closest(TILT_SELECTOR) as HTMLElement | null) : null;
      if (current && current !== target) release(current);
      current = target;
      if (!target) return;
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const max = r.width > 600 ? 2 : 5;
      target.classList.add('au-tilted', 'au-tilt-live');
      target.style.setProperty('--au-ry', `${(px * max).toFixed(2)}deg`);
      target.style.setProperty('--au-rx', `${(-py * max).toFixed(2)}deg`);
      target.style.setProperty('--au-mx', `${((px + 0.5) * 100).toFixed(1)}%`);
      target.style.setProperty('--au-my', `${((py + 0.5) * 100).toFixed(1)}%`);
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType !== 'mouse' || !fine.matches || reduced.matches) {
        if (current) release(current);
        current = null;
        return;
      }
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    }

    function onLeave() {
      if (current) release(current);
      current = null;
    }

    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
      if (current) release(current);
    };
  }, []);
}

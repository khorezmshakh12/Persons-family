'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** useLayoutEffect warns when a component is rendered on the server. The
 * effects below only ever *do* anything in the browser, so fall back to
 * useEffect during SSR. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Live `prefers-reduced-motion: reduce`. Starts `false` so the server and
 * the first client render agree; a reduced-motion viewer is corrected before
 * paint by the layout effect, which is soon enough — nothing has animated
 * yet at that point. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * The house "grow from 0 into the real shape" settings for a recharts
 * series — lines draw themselves in, bars/areas grow from the baseline.
 *
 * Spread onto every `<Line>`/`<Bar>`/`<Area>` rather than hand-tuning each
 * one, so no chart in the app animates at a different speed than its
 * neighbour. Recharts' own animation is used deliberately: it already ships
 * with the library, so this adds no dependency and no hand-rolled path maths.
 *
 * Resilience: recharts renders the finished geometry the moment the
 * animation completes and, with `isAnimationActive` false, immediately —
 * there is no CSS resting state that can strand a chart invisible. Under
 * `prefers-reduced-motion` the final shape is what renders on the first
 * frame.
 */
export function useChartAnimation(durationMs = 700) {
  const reduced = usePrefersReducedMotion();
  return {
    isAnimationActive: !reduced,
    animationDuration: durationMs,
    animationBegin: 0,
    animationEasing: 'ease-out' as const,
  };
}

/** Cubic ease-out — fast off the mark, settling into the final value. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * A 0 → 1 progress value for "grow from nothing into the real shape"
 * entrances, restarted whenever `key` changes.
 *
 * THE RESILIENCE CONTRACT, and the reason this returns 1 by default rather
 * than 0: the caller renders the REAL value multiplied by this. The initial
 * state is 1, so the server-rendered HTML — and any client where JS never
 * runs, throws, or is mid-hydration — shows the finished number/chart. Only
 * once a layout effect has actually confirmed it can drive an animation does
 * progress drop to 0 (before the browser paints, so there is no flash) and
 * climb back. A stalled rAF leaves the value part-way, never hidden, and
 * `prefers-reduced-motion` skips the whole thing and stays at 1.
 *
 * Never gate content on this with opacity or scale — it is an enhancement
 * layered over already-rendered output.
 */
export function useEnterProgress(durationMs = 600, key: unknown = null): number {
  const [progress, setProgress] = useState(1);
  const reduced = usePrefersReducedMotion();
  const frameRef = useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (reduced) {
      setProgress(1);
      return;
    }
    // Drop to 0 *inside* the layout effect: it runs before paint, so the
    // viewer never sees the final value flash before the count-up starts.
    setProgress(0);
    const startedAt = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      setProgress(easeOut(t));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      // Whatever interrupted the animation, the resting state is the real
      // one — never the half-drawn frame we were on.
      setProgress(1);
    };
  }, [durationMs, key, reduced]);

  return progress;
}

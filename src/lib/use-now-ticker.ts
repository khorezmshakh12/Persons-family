'use client';

import { useSyncExternalStore } from 'react';

/**
 * ONE shared 1-second clock for every live countdown on the page.
 *
 * A board with 40 task cards must not run 40 intervals: every subscriber
 * reads the same `current` value and all of them re-render off the same
 * tick. The timer only runs while at least one component is subscribed and
 * the tab is visible — a hidden tab stops ticking entirely and catches up
 * with an immediate tick when it becomes visible again.
 *
 * Ticks are aligned to the wall-clock second boundary (setTimeout chain,
 * not setInterval), so every countdown flips its seconds digit together and
 * a deadline at hh:mm:00 is crossed on the tick that lands right after it.
 *
 * Hydration: the server snapshot is `null`, so SSR and the hydration pass
 * both render the stable placeholder; React then re-renders with the client
 * snapshot straight after hydrating. No `Date.now()` ever reaches the server
 * HTML, so there is nothing to mismatch.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let current: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  current = Date.now();
  for (const l of listeners) l();
}

function schedule() {
  if (timer !== null || listeners.size === 0) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  // +8ms so the tick lands just *after* the boundary, not a hair before it
  // (which would still show the previous second after rounding).
  const delay = 1000 - (Date.now() % 1000) + 8;
  timer = setTimeout(() => {
    timer = null;
    emit();
    schedule();
  }, delay);
}

function stop() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    stop();
  } else {
    emit();
    schedule();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibilityChange);
    // First subscriber: refresh the (possibly stale / null) value right
    // away instead of waiting up to a second for the first tick.
    emit();
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

/** Current epoch ms, updated once per second; `null` on the server and
 * during hydration — render a placeholder for that case. */
export function useNowTicker(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

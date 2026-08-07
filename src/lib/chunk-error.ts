/**
 * After a deploy, a browser tab that's been open since before it still holds
 * JS chunk URLs baked with the *previous* build's hash. The next client-side
 * navigation (Link/router.push, not a full reload) that needs a chunk not in
 * that tab's cache 404s against the new deployment, which throws — and our
 * error boundaries would otherwise show "Something went wrong" with a "Try
 * again" that just re-renders the same stale bundle and fails again. A full
 * reload fetches the current HTML + manifest and fixes it outright, so we
 * detect this specific error shape and reload once automatically instead of
 * making the user work out that "refresh the page" is the fix.
 */
export function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /Loading chunk [\d]+ failed/i.test(error.message) ||
    /Failed to fetch dynamically imported module/i.test(error.message) ||
    /error loading dynamically imported module/i.test(error.message) ||
    /Importing a module script failed/i.test(error.message) ||
    /Unable to preload CSS for/i.test(error.message)
  );
}

const RELOAD_GUARD_KEY = 'chunk-error-reload-attempted';

/** Reloads once per browsing session for this error shape — if the page
 * still throws after a fresh load, it's a real bug, not a stale chunk, so
 * this stops trying and lets the normal error UI show instead of looping. */
export function reloadOnceForChunkError(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.sessionStorage.getItem(RELOAD_GUARD_KEY)) return false;
  window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
  window.location.reload();
  return true;
}

/** Called from a spot that renders on every successful navigation (e.g.
 * PageTransition) — clears the guard so a later, genuinely new stale-chunk
 * incident (after the next deploy) still gets its one automatic reload
 * instead of being silently skipped because a past incident used it up. */
export function clearChunkErrorGuard(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
}

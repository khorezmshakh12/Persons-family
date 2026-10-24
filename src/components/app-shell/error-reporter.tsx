'use client';

import { useEffect } from 'react';

const ENDPOINT = '/staff/api/client-error';
const HEALTH = '/staff/api/health';
const MAX_PER_PAGE = 5;
/** How often an open, visible tab asks whether a new build is live. */
const SKEW_CHECK_MS = 5 * 60_000;

/** Set once a reload for a new build is under way: everything that fails
 * after it (other in-flight Server Actions, aborted fetches) is a symptom of
 * the reload, not a bug, and is not reported. */
let reloading = false;
/** Set while the page is being left — fetches it aborts are not errors. */
let leaving = false;

const STALE_BUILD = /Server Action .* was not found|Failed to find Server Action/;
const NETWORK = /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|network error)$/i;

/** Reload once (at most every 2 minutes, so a real bug can't loop) to pick
 * up the new build. Returns false when the guard refuses — the failure
 * survived a reload and is worth reporting. */
function reloadForNewBuild(): boolean {
  if (reloading) return true;
  try {
    const last = Number(sessionStorage.getItem('stale-build-reload') ?? 0);
    if (Date.now() - last < 120_000) return false;
    sessionStorage.setItem('stale-build-reload', String(Date.now()));
  } catch {
    return false;
  }
  reloading = true;
  location.reload();
  return true;
}

/** After a deploy, a tab opened on the old build calls Server Actions the
 * new server no longer has. Several usually fail at once (background
 * polls), so the first one reloads and the rest stay quiet. */
function handledAsStaleBuild(message: string): boolean {
  return STALE_BUILD.test(message) && reloadForNewBuild();
}

/** A dropped connection — offline, the tab leaving, or a reload cutting a
 * request short — says nothing about our code. */
function isNoise(message: string): boolean {
  if (reloading || leaving) return true;
  if (!NETWORK.test(message.trim())) return false;
  return !navigator.onLine || document.visibilityState === 'hidden';
}

export function reportClientError(message: string, stack?: string) {
  if (handledAsStaleBuild(message) || isNoise(message)) return;
  try {
    const body = JSON.stringify({ message, stack, path: location.pathname });
    if (!navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) {
      void fetch(ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* reporting must never throw */
  }
}

/** Proactive version-skew check: compare this page's build (Next's
 * data-dpl-id) with the server's. On a mismatch, reload while the tab is
 * idle — before a click hits a Server Action that no longer exists. */
async function checkForNewBuild() {
  const mine = document.documentElement.dataset.dplId;
  if (!mine || reloading || document.visibilityState !== 'visible') return;
  try {
    const res = await fetch(HEALTH, { cache: 'no-store' });
    if (!res.ok) return;
    const { deployment } = (await res.json()) as { deployment?: string | null };
    if (!deployment || deployment === mine) return;
    // Never throw away what someone is typing; the next check retries.
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return;
    if (document.querySelector('[role="dialog"]')) return;
    reloadForNewBuild();
  } catch {
    /* offline or mid-deploy — try again later */
  }
}

export function ErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    const send = (message: string, stack?: string) => {
      if (!message || seen.has(message) || seen.size >= MAX_PER_PAGE) return;
      // Browser-extension noise and cross-origin "Script error." carry no
      // information about our code.
      if (message === 'Script error.' || /extension:\/\//.test(stack ?? '')) return;
      seen.add(message);
      reportClientError(message, stack);
    };
    const onError = (e: ErrorEvent) => send(e.message, e.error instanceof Error ? e.error.stack : undefined);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      send(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
    };
    const onLeave = () => {
      leaving = true;
    };
    const onShow = () => {
      leaving = false;
    };
    let lastCheck = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 30_000) return;
      lastCheck = Date.now();
      void checkForNewBuild();
    };
    const timer = window.setInterval(() => {
      lastCheck = Date.now();
      void checkForNewBuild();
    }, SKEW_CHECK_MS);

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}

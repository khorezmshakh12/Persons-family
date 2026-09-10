'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

const VERSION_URL = '/staff/api/version';
// Cheap poll — a plain JSON read with no auth, and the interesting event
// (a deploy) happens a couple of times a day at most. Also re-checked
// whenever the tab regains focus, which is when someone is about to
// interact again.
const POLL_MS = 90_000;

/**
 * Shows a "new version — reload" prompt when the deployment changes while
 * this tab is open. That's the window in which a Server Action the page
 * still references 404s ("Failed to find Server Action" — Next.js rotates
 * action IDs every build), so without this the first click after a deploy
 * just silently fails and the user is left re-clicking a dead button.
 *
 * Two triggers, either is enough:
 *  - the /api/version revision no longer matches the one seen on mount
 *  - an unhandled rejection whose message is that exact Server Action error
 *
 * Renders nothing until then. Not dismissable on purpose: the page really
 * is broken for mutations until it's reloaded, and the prompt is a single
 * unobtrusive strip.
 */
export function VersionWatcher() {
  const t = useTranslations('common');
  const [stale, setStale] = useState(false);
  const seenRevision = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(VERSION_URL, { cache: 'no-store' });
        if (!res.ok) return;
        const { revision } = (await res.json()) as { revision?: string };
        if (cancelled || typeof revision !== 'string') return;
        if (seenRevision.current === null) {
          seenRevision.current = revision;
        } else if (revision !== seenRevision.current) {
          setStale(true);
        }
      } catch {
        // Offline / transient — the next tick retries.
      }
    };

    void check();
    const interval = setInterval(check, POLL_MS);

    const onFocus = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onFocus);

    const onRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? '');
      if (message.includes('Failed to find Server Action')) setStale(true);
    };
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-100 flex items-center justify-center gap-3 border-t border-amber-400/40 bg-amber-500/95 px-4 py-2.5 text-sm font-medium text-black shadow-lg">
      <span>{t('newVersion')}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-black"
      >
        <RefreshCw className="size-3.5" />
        {t('reload')}
      </button>
    </div>
  );
}

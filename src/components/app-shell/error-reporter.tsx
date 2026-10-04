'use client';

import { useEffect } from 'react';

const ENDPOINT = '/staff/api/client-error';
const MAX_PER_PAGE = 5;

/** Sends uncaught browser errors to /api/client-error (system_logs). At most
 * five per page load, each distinct message once. Renders nothing. */
export function reportClientError(message: string, stack?: string) {
  try {
    const body = JSON.stringify({ message, stack, path: location.pathname });
    if (!navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) {
      void fetch(ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* reporting must never throw */
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
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}

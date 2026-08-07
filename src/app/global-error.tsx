'use client';

import { useEffect } from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunk-error';

// Only fires if the ROOT layout itself throws (before next-intl/theme
// providers even mount), so this can't use next-intl, the design-system
// Button, or Tailwind's dark-mode class strategy — it defines its own
// <html>/<body> and inlines every style so it renders no matter what else
// is broken.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root error boundary caught:', error);
    // Same stale-chunk-after-deploy situation as the route-level error
    // boundary (src/app/[locale]/error.tsx) — reload outright rather than
    // show "Something went wrong" for what a fresh load fixes instantly.
    if (isChunkLoadError(error)) reloadOnceForChunkError();
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: 'radial-gradient(circle at top, #1e293b, #0f172a 65%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '28rem',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: '2.5rem 2rem',
            borderRadius: '1.5rem',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            color: '#fff',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '3.5rem',
              height: '3.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '9999px',
              border: '1px solid rgba(248,113,113,0.3)',
              background: 'rgba(239,68,68,0.15)',
              fontSize: '1.75rem',
            }}
          >
            ⚠️
          </div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Something went wrong</h2>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
            The application hit an unexpected error. Please try again — if this keeps happening, contact your
            administrator.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1.25rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: '#2dd4bf',
              color: '#0f172a',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

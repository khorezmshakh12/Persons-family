import { Suspense, ViewTransition, type ReactNode } from 'react';

/** Suspense whose skeleton fades out as the streamed content fades and rises
 * in (#10). View Transition snapshots only — the real content is never held
 * hidden, so a skipped animation just swaps instantly. */
export function Reveal({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="page-out" default="none">
          {fallback}
        </ViewTransition>
      }
    >
      <ViewTransition enter="page-in" default="none">
        {children}
      </ViewTransition>
    </Suspense>
  );
}

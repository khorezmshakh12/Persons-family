'use client';

import { useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { clearChunkErrorGuard } from '@/lib/chunk-error';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Any successful render here means the app is healthy on the current
  // bundle, so clear the chunk-error reload guard — otherwise a tab that
  // hit one stale-chunk error would only ever get the automatic reload
  // once, instead of once per actual incident.
  useEffect(() => {
    clearChunkErrorGuard();
  }, [pathname]);

  // No animation on this wrapper. It sits above every authenticated page,
  // so anything that can leave it at opacity:0 (a stalled framer
  // initial/animate, or a `both`-fill CSS keyframe that starts hidden)
  // blanks the entire app. Per-page and per-component entrances still
  // animate; the app-wide wrapper stays a plain, always-visible element.
  // Keyed by pathname so a route change gets a fresh subtree.
  return <div key={pathname}>{children}</div>;
}

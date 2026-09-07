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

  // Keyed by pathname so React remounts on navigation and the CSS enter
  // animation re-runs. Deliberately a plain CSS animation (`both` fill),
  // not a framer initial/animate: this wraps every page in the app, and a
  // stalled JS animation here would blank the whole screen. CSS can't
  // strand it, and dropping the AnimatePresence "wait for exit" round-trip
  // keeps navigation feeling instant.
  return (
    <div key={pathname} className="animate-page-enter">
      {children}
    </div>
  );
}

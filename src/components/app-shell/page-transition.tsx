'use client';

import { useEffect, ViewTransition } from 'react';
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
  // blanks the entire app. Per-component entrances still animate safely;
  // the app-wide wrapper stays a plain, always-visible element.
  // Keyed by pathname so a route change gets a fresh subtree. The page
  // enter/exit is a View Transition (motion-v4.css): it animates browser
  // snapshots, never this element, so the safety rule above still holds.
  // Navigations tagged nav-forward / nav-back (sidebar order) slide by
  // direction; anything else gets the plain fade-and-rise.
  return (
    <ViewTransition
      key={pathname}
      enter={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-in' }}
      exit={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-out' }}
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}


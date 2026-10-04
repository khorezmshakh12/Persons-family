'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Mounts the three.js butterfly scene into a div; three is loaded lazily,
 * so only people who open the page (or pick it as background) download it. */
export function ButterflyCanvas({ variant, className }: { variant: 'full' | 'background'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void import('./butterfly-scene').then(({ mountButterfly }) => {
      if (cancelled) return;
      try {
        cleanup = mountButterfly(host, { variant });
      } catch {
        /* no WebGL — leave the plain background */
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [variant]);

  return <div ref={ref} aria-hidden className={cn('h-full w-full', className)} />;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';

/** One page of the owner's Core v2 (src/core/core.html), embedded 1:1 in a
 * site section. `auto` = grows with its content (reported by the bridge),
 * otherwise it fills the viewport and scrolls inside. */
export function CoreFrame({ view, auto = false, title }: { view: string; auto?: boolean; title: string }) {
  const locale = useLocale();
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(auto ? 640 : 0);

  useEffect(() => {
    if (!auto) return;
    const on = (e: MessageEvent) => {
      if (e.origin === location.origin && e.source === ref.current?.contentWindow && typeof e.data?.coreH === 'number') {
        setH(Math.max(200, e.data.coreH));
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [auto]);

  return (
    <iframe
      ref={ref}
      title={title}
      src={`/staff/api/core/app?l=${locale}&p=${view}${auto ? '&h=auto' : ''}`}
      className="w-full rounded-2xl border border-[var(--au-line)] bg-[var(--au-card)]"
      style={auto ? { height: h } : { height: 'calc(100dvh - 8.5rem)', minHeight: 560 }}
    />
  );
}

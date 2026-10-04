'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { currentTheme, DEFAULT_THEME, subscribeTheme } from '@/lib/themes';

// Core v2 keeps its own token names; under a non-Aurora theme the site's
// tokens are copied onto the (same-origin) iframe's root so Core follows the
// theme too. Aurora clears them, leaving Core's own palette (identical to
// Aurora) and its own dark toggle untouched.
const CORE_TOKENS: [string, string][] = [
  ['--bg', '--au-bg'],
  ['--side', '--au-sidebar'],
  ['--card', '--au-card'],
  ['--card2', '--au-card-2'],
  ['--line', '--au-line'],
  ['--line2', '--au-line'],
  ['--ink', '--au-ink'],
  ['--muted', '--au-muted'],
  ['--faint', '--au-faint'],
  ['--acc', '--au-accent'],
  ['--acc-ink', '--au-accent-ink'],
  ['--acc-text', '--au-accent-text'],
  ['--acc-soft', '--au-accent-soft'],
  ['--ok', '--au-ok'],
  ['--ok2', '--au-ok'],
  ['--ok-soft', '--au-ok-soft'],
  ['--info', '--au-info'],
  ['--info-soft', '--au-info-soft'],
  ['--bad', '--au-bad'],
  ['--bad-soft', '--au-bad-soft'],
  ['--r', '--au-radius-card'],
  ['--r-sm', '--au-radius-ctl'],
  ['--shadow', '--au-shadow-card'],
  ['--hero', '--au-hero'],
];

function paintCore(frame: HTMLIFrameElement | null) {
  const root = frame?.contentDocument?.documentElement;
  if (!root) return;
  const themed = currentTheme() !== DEFAULT_THEME;
  const css = getComputedStyle(document.documentElement);
  for (const [core, au] of CORE_TOKENS) {
    const v = css.getPropertyValue(au).trim();
    if (themed && v) root.style.setProperty(core, v);
    else root.style.removeProperty(core);
  }
  root.style.colorScheme = themed ? css.colorScheme : '';
}

/** One page of the owner's Core v2 (src/core/core.html), embedded 1:1 in a
 * site section. `auto` = grows with its content (reported by the bridge),
 * otherwise it fills the viewport and scrolls inside. */
export function CoreFrame({ view, auto = false, title }: { view: string; auto?: boolean; title: string }) {
  const locale = useLocale();
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(auto ? 640 : 0);

  useEffect(() => {
    const frame = ref.current;
    const paint = () => paintCore(ref.current);
    frame?.addEventListener('load', paint);
    paint();
    const unsubscribe = subscribeTheme(paint);
    return () => {
      frame?.removeEventListener('load', paint);
      unsubscribe();
    };
  }, []);

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
      style={auto ? { height: h } : { height: 'calc(100dvh - var(--app-chrome) - 3rem)', minHeight: 560 }}
    />
  );
}

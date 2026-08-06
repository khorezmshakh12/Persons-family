'use client';

import { useEffect } from 'react';

/**
 * iOS Safari never fires the CSS `:active` pseudo-class on a plain tap
 * unless *some* element has a touch listener attached — a decades-old
 * WebKit quirk. Without this, every `active:scale-*` press animation in
 * the app (buttons, cards, tap-scale utility) silently does nothing on
 * iPhone/iPad, even though it works perfectly via mouse on desktop.
 */
export function IosActiveFix() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener('touchstart', noop, { passive: true });
    return () => document.removeEventListener('touchstart', noop);
  }, []);

  return null;
}

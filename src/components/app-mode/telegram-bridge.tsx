'use client';

import { useEffect, useState } from 'react';
import { usePathname } from '@/i18n/navigation';
import { NAV_ITEMS } from '@/lib/nav';
import { getTelegramWebApp, isTelegramApp } from '@/lib/telegram-webapp';
import { subscribeTheme } from '@/lib/themes';

const ROOT_PATHS = new Set(['/', '/login', '/tg', '/set-password', ...NAV_ITEMS.map((i) => i.href)]);

function goBack() {
  window.history.back();
}

/**
 * Makes the site behave like a native app inside Telegram: full height,
 * no swipe-to-close while scrolling, Telegram's chrome painted in the page
 * colour, and Telegram's own Back button for anything below a top-level
 * section. Renders nothing; a no-op outside Telegram.
 */
export function TelegramBridge() {
  const pathname = usePathname();
  const [sdkReady, setSdkReady] = useState(false);

  // Mount-only: the SDK calls are idempotent but none need repeating.
  useEffect(() => {
    if (!isTelegramApp()) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void getTelegramWebApp().then((wa) => {
      if (!wa || cancelled) return;
      setSdkReady(true);
      try {
        wa.ready();
        wa.expand();
        if (wa.isVersionAtLeast('7.7')) wa.disableVerticalSwipes?.();
      } catch {
        // an old Telegram client missing one of these — the page still works
      }
      // Telegram's chrome follows the page colour — and again on every
      // theme switch (lib/themes.ts flips data-theme on <html>).
      const paint = () => {
        try {
          const css = getComputedStyle(document.documentElement);
          const bg = css.getPropertyValue('--au-bg').trim();
          const card = css.getPropertyValue('--au-card').trim();
          if (wa.isVersionAtLeast('6.1') && bg.startsWith('#')) {
            wa.setHeaderColor(bg);
            wa.setBackgroundColor(bg);
          }
          if (wa.isVersionAtLeast('7.10') && card.startsWith('#')) wa.setBottomBarColor?.(card);
        } catch {
          // old client
        }
      };
      paint();
      if (!cancelled) unsubscribe = subscribeTheme(paint);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!isTelegramApp()) return;
    const wa = window.Telegram?.WebApp;
    if (!wa || !wa.isVersionAtLeast('6.1')) return;
    if (ROOT_PATHS.has(pathname)) {
      wa.BackButton.hide();
      return;
    }
    wa.BackButton.onClick(goBack);
    wa.BackButton.show();
    return () => wa.BackButton.offClick(goBack);
  }, [pathname, sdkReady]);

  return null;
}

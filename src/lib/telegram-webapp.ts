'use client';

/** The slice of Telegram's Mini App SDK (telegram-web-app.js) we use. */
export type TelegramWebApp = {
  initData: string;
  version: string;
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    selectionChanged(): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js?59';

/** True inside a Telegram Mini App webview — set before first paint by
 * AppModeScript, which also remembers it for the rest of the session. */
export function isTelegramApp(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.app === 'tg';
}

let loading: Promise<TelegramWebApp | null> | null = null;

/** Loads Telegram's SDK once (only inside Telegram) and resolves its
 * WebApp object; null anywhere else or if the script can't load. */
export function getTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (!isTelegramApp()) return Promise.resolve(null);
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  loading ??= new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.Telegram?.WebApp ?? null);
    script.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Light haptic tick for taps — a no-op outside Telegram. */
export function haptic(kind: 'tap' | 'select' | 'success' | 'error' = 'tap') {
  const h = typeof window !== 'undefined' ? window.Telegram?.WebApp?.HapticFeedback : undefined;
  if (!h) return;
  try {
    if (kind === 'tap') h.impactOccurred('light');
    else if (kind === 'select') h.selectionChanged();
    else h.notificationOccurred(kind);
  } catch {
    // older clients without haptics
  }
}

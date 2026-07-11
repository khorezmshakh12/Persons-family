'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { DEFAULT_BACKGROUND } from '@/lib/background-themes';

const STORAGE_KEY = 'app-background-url';
const MODE_STORAGE_KEY = 'app-theme-mode';

export type ThemeMode = 'photo' | 'flat-white' | 'flat-black';

type BackgroundContextValue = {
  backgroundUrl: string;
  themeMode: ThemeMode;
  setBackgroundUrl: (url: string) => { error?: string } | void;
  setThemeMode: (mode: ThemeMode) => void;
};

const BackgroundContext = createContext<BackgroundContextValue | null>(null);

// BackgroundProvider sits above the entire app shell, so a stable context
// value matters: without useMemo/useCallback here, every re-render of this
// provider (e.g. from a parent layout re-render) would hand every consumer
// (DynamicBackground, the Settings theme selector) a brand-new object/
// function identity, even when backgroundUrl itself hasn't changed —
// forcing all of them to re-render for no reason.
export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [backgroundUrl, setBackgroundUrlState] = useState(DEFAULT_BACKGROUND);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('photo');
  const { setTheme } = useTheme();

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setBackgroundUrlState(stored);
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (storedMode === 'flat-white' || storedMode === 'flat-black') setThemeModeState(storedMode);
  }, []);

  // Reflects themeMode onto <html data-flat-theme> so the CSS in globals.css
  // (which targets Tailwind's own generated class names via attribute
  // selectors) can neutralize glassmorphism everywhere at once, including
  // Radix-portaled dialog/sheet content that isn't a DOM descendant of the
  // app shell tree but still lives under <html>. Also nudges next-themes'
  // light/dark so the few surfaces outside the glass system (e.g. the login
  // page) stay visually consistent with the chosen flat theme; photo mode
  // deliberately leaves next-themes alone.
  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === 'flat-white') {
      root.setAttribute('data-flat-theme', 'white');
      setTheme('light');
    } else if (themeMode === 'flat-black') {
      root.setAttribute('data-flat-theme', 'black');
      setTheme('dark');
    } else {
      root.removeAttribute('data-flat-theme');
    }
  }, [themeMode, setTheme]);

  const setBackgroundUrl = useCallback((url: string) => {
    setBackgroundUrlState(url);
    setThemeModeState('photo');
    try {
      window.localStorage.setItem(STORAGE_KEY, url);
      window.localStorage.setItem(MODE_STORAGE_KEY, 'photo');
    } catch {
      // Custom uploads are size-checked before this is called, but a very
      // full localStorage (other apps on the same origin, etc.) can still
      // throw QuotaExceededError — the background still updates for this
      // session, it just won't persist across a reload.
      return { error: 'storageQuotaExceeded' };
    }
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // Non-fatal — same reasoning as setBackgroundUrl above.
    }
  }, []);

  const value = useMemo(
    () => ({ backgroundUrl, themeMode, setBackgroundUrl, setThemeMode }),
    [backgroundUrl, themeMode, setBackgroundUrl, setThemeMode],
  );

  return <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>;
}

export function useBackground() {
  const ctx = useContext(BackgroundContext);
  if (!ctx) throw new Error('useBackground must be used within a BackgroundProvider');
  return ctx;
}

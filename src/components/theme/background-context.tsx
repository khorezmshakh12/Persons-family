'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_BACKGROUND } from '@/lib/background-themes';

const STORAGE_KEY = 'app-background-url';
const MODE_STORAGE_KEY = 'app-theme-mode';
const BLUR_STORAGE_KEY = 'app-glass-blur';

export type ThemeMode = 'photo' | 'video';

const ALL_MODES: ThemeMode[] = ['photo', 'video'];

export const DEFAULT_GLASS_BLUR = 16;
export const MIN_GLASS_BLUR = 0;
export const MAX_GLASS_BLUR = 32;

type BackgroundContextValue = {
  backgroundUrl: string;
  themeMode: ThemeMode;
  setBackgroundUrl: (url: string) => { error?: string } | void;
  setThemeMode: (mode: ThemeMode) => void;
  glassBlur: number;
  setGlassBlur: (px: number) => void;
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
  // 'video' (the looping cinematic clip) is the default background for
  // anyone who hasn't already picked a theme — see the effect below, which
  // still restores whatever a returning user previously chose.
  const [themeMode, setThemeModeState] = useState<ThemeMode>('video');
  const [glassBlur, setGlassBlurState] = useState(DEFAULT_GLASS_BLUR);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setBackgroundUrlState(stored);
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (storedMode && ALL_MODES.includes(storedMode as ThemeMode)) setThemeModeState(storedMode as ThemeMode);
    const storedBlur = window.localStorage.getItem(BLUR_STORAGE_KEY);
    if (storedBlur) {
      const parsed = Number(storedBlur);
      if (Number.isFinite(parsed)) setGlassBlurState(Math.min(MAX_GLASS_BLUR, Math.max(MIN_GLASS_BLUR, parsed)));
    }
  }, []);

  // Every glass panel (GLASS_CARD, header, sidebar, dialogs, ...) reads its
  // backdrop-filter from this custom property via globals.css's
  // `[class*="backdrop-blur"]` override — see that rule's comment for why
  // a single shared variable beats touching the ~90 components that inline
  // a raw backdrop-blur-* class.
  useEffect(() => {
    document.documentElement.style.setProperty('--glass-blur', `${glassBlur}px`);
  }, [glassBlur]);

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

  const setGlassBlur = useCallback((px: number) => {
    const clamped = Math.min(MAX_GLASS_BLUR, Math.max(MIN_GLASS_BLUR, px));
    setGlassBlurState(clamped);
    try {
      window.localStorage.setItem(BLUR_STORAGE_KEY, String(clamped));
    } catch {
      // Non-fatal — same reasoning as setBackgroundUrl above.
    }
  }, []);

  const value = useMemo(
    () => ({ backgroundUrl, themeMode, setBackgroundUrl, setThemeMode, glassBlur, setGlassBlur }),
    [backgroundUrl, themeMode, setBackgroundUrl, setThemeMode, glassBlur, setGlassBlur],
  );

  return <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>;
}

export function useBackground() {
  const ctx = useContext(BackgroundContext);
  if (!ctx) throw new Error('useBackground must be used within a BackgroundProvider');
  return ctx;
}

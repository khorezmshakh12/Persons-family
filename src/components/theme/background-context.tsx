'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_BACKGROUND } from '@/lib/background-themes';

const STORAGE_KEY = 'app-background-url';

type BackgroundContextValue = {
  backgroundUrl: string;
  setBackgroundUrl: (url: string) => { error?: string } | void;
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

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setBackgroundUrlState(stored);
  }, []);

  const setBackgroundUrl = useCallback((url: string) => {
    setBackgroundUrlState(url);
    try {
      window.localStorage.setItem(STORAGE_KEY, url);
    } catch {
      // Custom uploads are size-checked before this is called, but a very
      // full localStorage (other apps on the same origin, etc.) can still
      // throw QuotaExceededError — the background still updates for this
      // session, it just won't persist across a reload.
      return { error: 'storageQuotaExceeded' };
    }
  }, []);

  const value = useMemo(() => ({ backgroundUrl, setBackgroundUrl }), [backgroundUrl, setBackgroundUrl]);

  return <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>;
}

export function useBackground() {
  const ctx = useContext(BackgroundContext);
  if (!ctx) throw new Error('useBackground must be used within a BackgroundProvider');
  return ctx;
}

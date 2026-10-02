'use client';

import { useEffect } from 'react';
import { applyTheme, DEFAULT_THEME, readStoredTheme } from '@/lib/themes';

/** Re-applies the stored theme on client-side arrivals (where the inline boot
 * script didn't run) and resets <html> to Aurora when the signed-in area
 * unmounts, so the login screen never inherits a theme. */
export function ThemeSync() {
  useEffect(() => {
    applyTheme(readStoredTheme());
    return () => applyTheme(DEFAULT_THEME);
  }, []);
  return null;
}

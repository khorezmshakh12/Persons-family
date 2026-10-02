/**
 * Midnight ("Tun") is one of the themes in lib/themes.ts; these helpers keep
 * the moon toggle's API on top of it. Switching midnight off returns to the
 * person's last light theme rather than always to Aurora.
 */
import { currentTheme, lastLightTheme, setTheme, subscribeTheme, THEME_SWATCHES } from '@/lib/themes';

export function isMidnight(): boolean {
  return THEME_SWATCHES[currentTheme()].dark;
}

export function setMidnight(on: boolean) {
  setTheme(on ? 'midnight' : lastLightTheme());
}

export const subscribeMidnight = subscribeTheme;

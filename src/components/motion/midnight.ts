/**
 * Midnight ("Tun") is one of the themes in lib/themes.ts; these helpers keep
 * the moon toggle's API on top of it. Switching midnight off returns to the
 * person's last light theme rather than always to Aurora.
 */
import { currentTheme, lastLightTheme, setTheme, subscribeTheme, THEME_SWATCHES } from '@/lib/themes';
import { setUiThemeAction } from '@/lib/actions/profile';

export function isMidnight(): boolean {
  return THEME_SWATCHES[currentTheme()].dark;
}

export function setMidnight(on: boolean) {
  const next = on ? 'midnight' : lastLightTheme();
  setTheme(next);
  // Saved on the profile too, or the next page load's server theme would
  // undo the toggle.
  void setUiThemeAction(next).catch(() => {});
}

export const subscribeMidnight = subscribeTheme;

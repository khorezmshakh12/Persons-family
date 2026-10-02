/**
 * UI themes. A theme is `html[data-theme="<id>"]` overriding the Aurora
 * tokens (`--au-*`) plus its own motion profile — see src/app/themes.css.
 * Aurora is the default and sets no attribute at all, so its rendering is
 * exactly what it was before themes existed.
 *
 * The choice is per device (localStorage), like the notification sound: no
 * schema change, and the pre-paint boot script can read it synchronously so
 * the page never flashes the wrong colours.
 *
 * `midnight` is the id of the dark "Tun" theme the motion layer's moon
 * toggle has always set — kept so existing choices carry over.
 */

export const THEME_IDS = ['aurora', 'shimol', 'midnight', 'zumrad', 'qum', 'grafit', 'lola', 'okean'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'aurora';

/** Preview swatches for the picker: background, card, accent, ink. */
export const THEME_SWATCHES: Record<ThemeId, { bg: string; card: string; accent: string; ink: string; dark: boolean }> = {
  aurora: { bg: '#f4f2ee', card: '#ffffff', accent: '#ff9f1c', ink: '#17161a', dark: false },
  shimol: { bg: '#f2f4f8', card: '#ffffff', accent: '#2563eb', ink: '#0f172a', dark: false },
  midnight: { bg: '#0d0c10', card: '#18171c', accent: '#ff9f1c', ink: '#f3efe9', dark: true },
  zumrad: { bg: '#eef5f1', card: '#ffffff', accent: '#0f9d6b', ink: '#0f2a20', dark: false },
  qum: { bg: '#f6f1e8', card: '#fffdf8', accent: '#c2410c', ink: '#231c15', dark: false },
  grafit: { bg: '#ffffff', card: '#fafafa', accent: '#5b4cf0', ink: '#09090b', dark: false },
  lola: { bg: '#faf2f4', card: '#ffffff', accent: '#d6336c', ink: '#2a1520', dark: false },
  okean: { bg: '#08111f', card: '#0f1b2e', accent: '#22d3ee', ink: '#e6f0fb', dark: true },
};

export const THEME_KEY = 'persons-theme';
/** Pre-themes key the moon toggle wrote ('1' = midnight). Read once, as a fallback. */
const LEGACY_MIDNIGHT_KEY = 'persons-midnight';
/** The last light theme, so the moon toggle can switch back to it. */
const LAST_LIGHT_KEY = 'persons-theme-light';
const ATTR = 'data-theme';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** Inline pre-paint script (no flash on reload). Storage blocked → Aurora. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(!t&&localStorage.getItem('${LEGACY_MIDNIGHT_KEY}')==='1')t='midnight';if(t&&t!=='aurora'&&${JSON.stringify(THEME_IDS)}.indexOf(t)>=0)document.documentElement.setAttribute('${ATTR}',t)}catch(e){}`;

export function readStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isThemeId(stored)) return stored;
    if (localStorage.getItem(LEGACY_MIDNIGHT_KEY) === '1') return 'midnight';
  } catch {
    /* storage blocked */
  }
  return DEFAULT_THEME;
}

export function currentTheme(): ThemeId {
  const value = document.documentElement.getAttribute(ATTR);
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export function applyTheme(id: ThemeId) {
  const html = document.documentElement;
  if (id === DEFAULT_THEME) html.removeAttribute(ATTR);
  else html.setAttribute(ATTR, id);
}

export function setTheme(id: ThemeId) {
  applyTheme(id);
  try {
    localStorage.setItem(THEME_KEY, id);
    localStorage.removeItem(LEGACY_MIDNIGHT_KEY);
    if (!THEME_SWATCHES[id].dark) localStorage.setItem(LAST_LIGHT_KEY, id);
  } catch {
    /* storage blocked — the choice just doesn't persist */
  }
}

/** The light theme to return to when the moon toggle switches dark off. */
export function lastLightTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(LAST_LIGHT_KEY);
    if (isThemeId(stored) && !THEME_SWATCHES[stored].dark) return stored;
  } catch {
    /* storage blocked */
  }
  return DEFAULT_THEME;
}

/** For useSyncExternalStore: re-render when the <html> attribute flips. */
export function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
  return () => observer.disconnect();
}

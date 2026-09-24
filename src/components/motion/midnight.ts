/**
 * Midnight ("Tungi rejim") theme state: an attribute on <html> plus a
 * localStorage flag. Independent of next-themes (which is forced to
 * "light" and uses the `class` attribute) — so light rendering is never
 * touched. Only the motion layer calls these.
 */

export const MIDNIGHT_KEY = 'persons-midnight';
const ATTR = 'data-theme';
const VALUE = 'midnight';

/** Inline pre-paint script (no flash on reload). Storage blocked => light. */
export const MIDNIGHT_BOOT_SCRIPT = `try{if(localStorage.getItem('${MIDNIGHT_KEY}')==='1'){document.documentElement.setAttribute('${ATTR}','${VALUE}')}}catch(e){}`;

export function readMidnightPref(): boolean {
  try {
    return localStorage.getItem(MIDNIGHT_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMidnight(): boolean {
  return document.documentElement.getAttribute(ATTR) === VALUE;
}

export function applyMidnight(on: boolean) {
  const html = document.documentElement;
  if (on) html.setAttribute(ATTR, VALUE);
  else if (html.getAttribute(ATTR) === VALUE) html.removeAttribute(ATTR);
}

export function setMidnight(on: boolean) {
  applyMidnight(on);
  try {
    localStorage.setItem(MIDNIGHT_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked — the choice just doesn't persist */
  }
}

/** For useSyncExternalStore: re-render when the <html> attribute flips. */
export function subscribeMidnight(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
  return () => observer.disconnect();
}

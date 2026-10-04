/**
 * Moving page background (Settings › Orqa fon), per device, off by default.
 *   off      — plain page colour (no video anywhere)
 *   flow     — the themed abstract loops (public/bg/<theme>.*)
 *   aquarium — real aquarium footage (public/bg/aquarium/*)
 *   butterfly — the three.js "Butterfly in a Garden" particle scene
 * The pre-paint script sets html[data-bg]; BgVideo and a little CSS read it.
 */
export const BG_MODES = ['off', 'flow', 'aquarium', 'butterfly'] as const;
export type BgMode = (typeof BG_MODES)[number];
export const BG_KEY = 'persons-bg';
export const DEFAULT_BG: BgMode = 'off';

export function isBgMode(v: unknown): v is BgMode {
  return typeof v === 'string' && (BG_MODES as readonly string[]).includes(v);
}

export const BG_BOOT_SCRIPT = `try{var b=localStorage.getItem('${BG_KEY}');if(${JSON.stringify(BG_MODES)}.indexOf(b)<0)b='${DEFAULT_BG}';document.documentElement.setAttribute('data-bg',b)}catch(e){document.documentElement.setAttribute('data-bg','${DEFAULT_BG}')}`;

export function readStoredBg(): BgMode {
  try {
    const v = localStorage.getItem(BG_KEY);
    if (isBgMode(v)) return v;
  } catch {
    /* storage blocked */
  }
  return DEFAULT_BG;
}

export function currentBg(): BgMode {
  const v = document.documentElement.getAttribute('data-bg');
  return isBgMode(v) ? v : DEFAULT_BG;
}

export function setBg(mode: BgMode) {
  document.documentElement.setAttribute('data-bg', mode);
  try {
    localStorage.setItem(BG_KEY, mode);
  } catch {
    /* storage blocked */
  }
}

export function subscribeBg(onChange: () => void) {
  const o = new MutationObserver(onChange);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bg'] });
  return () => o.disconnect();
}

/** Flip to true once public/bg/aquarium/{light,dark}.{webm,mp4,jpg} exist. */
export const AQUARIUM_READY = false;

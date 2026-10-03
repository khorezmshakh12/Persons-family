/**
 * Per-person motion level (Settings › Harakat), replacing the old role gate.
 *   off  — no movement at all (beyond what the browser itself does)
 *   calm — page transitions, entrances, count-ups, micro-feedback (default)
 *   full — calm + the Motion v3 extras: island, tilt, confetti, scroll bar,
 *          living hero mesh, cursor glare
 * Stored per device. The pre-paint script sets html[data-motion-level] and,
 * for 'full', html[data-motion="on"] — the attribute every Motion v3 CSS
 * rule and the tilt hook already key on.
 * prefers-reduced-motion always wins: it caps the level at 'off'.
 */

export const MOTION_LEVELS = ['off', 'calm', 'full'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

export const MOTION_KEY = 'persons-motion';

export function isMotionLevel(v: unknown): v is MotionLevel {
  return typeof v === 'string' && (MOTION_LEVELS as readonly string[]).includes(v);
}

/** Pre-paint script. `roleDefault` keeps today's behaviour for people who
 * never chose: Motion v3 roles start on 'full', everyone else on 'calm'. */
export function motionBootScript(roleDefault: MotionLevel): string {
  return `try{var h=document.documentElement,l=localStorage.getItem('${MOTION_KEY}');if(${JSON.stringify(MOTION_LEVELS)}.indexOf(l)<0)l='${roleDefault}';if(matchMedia('(prefers-reduced-motion: reduce)').matches)l='off';h.setAttribute('data-motion-level',l);if(l==='full')h.setAttribute('data-motion','on');else h.removeAttribute('data-motion')}catch(e){}`;
}

export function currentMotionLevel(): MotionLevel {
  const v = document.documentElement.getAttribute('data-motion-level');
  return isMotionLevel(v) ? v : 'calm';
}

export function applyMotionLevel(level: MotionLevel) {
  const h = document.documentElement;
  h.setAttribute('data-motion-level', level);
  if (level === 'full') h.setAttribute('data-motion', 'on');
  else h.removeAttribute('data-motion');
}

export function setMotionLevel(level: MotionLevel) {
  applyMotionLevel(level);
  try {
    localStorage.setItem(MOTION_KEY, level);
  } catch {
    /* storage blocked */
  }
}

export function subscribeMotionLevel(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion-level'] });
  return () => observer.disconnect();
}

/** For JS-driven effects (count-up, confetti…): may this animation run? */
export function motionAllowed(min: Exclude<MotionLevel, 'off'> = 'calm'): boolean {
  if (typeof document === 'undefined') return false;
  const l = currentMotionLevel();
  return min === 'calm' ? l !== 'off' : l === 'full';
}

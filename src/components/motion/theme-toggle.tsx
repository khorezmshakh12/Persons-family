'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Moon, Sun } from 'lucide-react';
import { isMidnight, setMidnight, subscribeMidnight } from './midnight';

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

/**
 * Day / night toggle. With the View Transitions API the new theme is
 * revealed as a circle expanding from the button; without it (or under
 * reduced motion) the switch is instant. Either way the attribute flips
 * synchronously inside the update callback, so a failed/aborted transition
 * still leaves the chosen theme applied and the page fully visible.
 */
export function ThemeToggle() {
  const t = useTranslations('motion');
  const midnight = useSyncExternalStore(subscribeMidnight, isMidnight, () => false);

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    const next = !isMidnight();
    const apply = () => setMidnight(next);
    const doc = document as ViewTransitionDoc;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!doc.startViewTransition || reduced) {
      apply();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const html = document.documentElement;
    html.classList.add('au-vt-theme');
    try {
      const transition = doc.startViewTransition(apply);
      transition.ready
        .then(() => {
          html.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 700, easing: 'cubic-bezier(.7,0,.2,1)', pseudoElement: '::view-transition-new(root)' },
          );
        })
        .catch(() => {});
      transition.finished.finally(() => html.classList.remove('au-vt-theme')).catch(() => {});
    } catch {
      html.classList.remove('au-vt-theme');
      apply();
    }
  }

  const label = midnight ? t('daylight') : t('midnight');
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={midnight}
      title={label}
      className="au-theme-toggle grid size-[38px] shrink-0 place-items-center rounded-au-ctl border border-au-line bg-au-card text-au-muted transition-colors duration-150 hover:text-au-ink"
    >
      <Sun className="au-sun size-[17px]" strokeWidth={1.75} aria-hidden />
      <Moon className="au-moon size-[17px]" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

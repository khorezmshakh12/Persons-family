'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { CHIP_OK } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { setUiThemeAction } from '@/lib/actions/profile';
import {
  currentTheme,
  DEFAULT_THEME,
  setTheme,
  subscribeTheme,
  THEME_IDS,
  THEME_SWATCHES,
  type ThemeId,
} from '@/lib/themes';

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/** How each theme arrives on screen when picked — part of its motion
 * personality. 'fade' is the browser's own cross-fade. */
const REVEAL: Record<ThemeId, 'circle' | 'fade' | 'down' | 'up' | 'right'> = {
  aurora: 'circle',
  shimol: 'fade',
  midnight: 'circle',
  zumrad: 'fade',
  qum: 'down',
  grafit: 'right',
  lola: 'circle',
  okean: 'up',
};

/**
 * Settings › Theme. Eight themes, each with its own colours, typeface and
 * motion profile (src/app/themes.css). The choice is stored per device.
 */
export function ThemeSettingsCard() {
  const t = useTranslations('themeSettings');
  const active = useSyncExternalStore(subscribeTheme, currentTheme, () => DEFAULT_THEME);

  function pick(id: ThemeId, event: React.MouseEvent<HTMLButtonElement>) {
    if (id === currentTheme()) return;
    const apply = () => setTheme(id);
    // Follow the person to their other devices; a failed save only means
    // this device keeps the choice locally.
    void setUiThemeAction(id).catch(() => {});
    const doc = document as ViewTransitionDoc;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!doc.startViewTransition || reduced) {
      apply();
      return;
    }
    const reveal = REVEAL[id];
    const html = document.documentElement;
    // The clip-path reveals replace the browser's cross-fade; 'fade' keeps it.
    if (reveal !== 'fade') html.classList.add('au-vt-theme');
    try {
      const transition = doc.startViewTransition(apply);
      if (reveal !== 'fade') {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        const clipPath =
          reveal === 'circle'
            ? [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
            : reveal === 'down'
              ? ['inset(0 0 100% 0)', 'inset(0 0 0 0)']
              : reveal === 'up'
                ? ['inset(100% 0 0 0)', 'inset(0 0 0 0)']
                : ['inset(0 100% 0 0)', 'inset(0 0 0 0)'];
        transition.ready
          .then(() => {
            html.animate(
              { clipPath },
              {
                duration: reveal === 'right' ? 380 : reveal === 'circle' ? 700 : 820,
                easing: 'cubic-bezier(.7,0,.2,1)',
                pseudoElement: '::view-transition-new(root)',
              },
            );
          })
          .catch(() => {});
      }
      transition.finished.finally(() => html.classList.remove('au-vt-theme')).catch(() => {});
    } catch {
      html.classList.remove('au-vt-theme');
      apply();
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {THEME_IDS.map((id) => {
        const s = THEME_SWATCHES[id];
        const on = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={(e) => pick(id, e)}
            aria-pressed={on}
            className={cn(
              'btn-motion flex flex-col gap-3 rounded-au-ctl border bg-au-card p-3 text-left transition-shadow',
              on ? 'border-au-accent ring-2 ring-au-accent' : 'border-au-line hover:shadow-au-card-hover',
            )}
          >
            {/* Miniature of the theme itself: its background, sidebar, a
                card with the accent and ink — real colours, not a guess. */}
            <div
              aria-hidden
              className="flex h-20 gap-1.5 overflow-hidden rounded-lg border p-1.5"
              style={{ background: s.bg, borderColor: s.dark ? '#ffffff1a' : '#0000000f' }}
            >
              <div className="w-5 rounded" style={{ background: s.card }} />
              <div className="flex flex-1 flex-col gap-1.5 rounded p-2" style={{ background: s.card }}>
                <div className="h-1.5 w-2/3 rounded-full" style={{ background: s.ink }} />
                <div className="h-1.5 w-1/3 rounded-full opacity-40" style={{ background: s.ink }} />
                <div className="mt-auto h-3 w-10 rounded-full" style={{ background: s.accent }} />
              </div>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-bold text-au-ink">{t(`themes.${id}.name`)}</span>
                <span className="text-xs text-au-muted">{t(`themes.${id}.hint`)}</span>
                <span className="mt-1 text-[11px] font-medium text-au-muted">
                  {t('motionLabel')}: {t(`themes.${id}.motion`)}
                </span>
              </div>
              {on && (
                <span className={cn(CHIP_OK, 'shrink-0')}>
                  <Check className="size-3.5" strokeWidth={2} aria-hidden />
                  {t('active')}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { CHIP_NEUTRAL, CHIP_OK } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { AQUARIUM_READY, BG_MODES, currentBg, DEFAULT_BG, setBg, subscribeBg } from '@/lib/bg-mode';

/** Settings › Orqa fon: off / flowing colour / aquarium, per device. */
export function BgSettingsCard() {
  const t = useTranslations('bgSettings');
  const mode = useSyncExternalStore(subscribeBg, currentBg, () => DEFAULT_BG);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {BG_MODES.map((m) => {
        const on = m === mode;
        const soon = m === 'aquarium' && !AQUARIUM_READY;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            disabled={soon}
            onClick={() => setBg(m)}
            className={cn(
              'btn-motion flex flex-col gap-1 rounded-au-ctl border bg-au-card p-4 text-left disabled:cursor-not-allowed disabled:opacity-60',
              on ? 'border-au-accent ring-2 ring-au-accent' : 'border-au-line enabled:hover:shadow-au-card-hover',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-au-ink">{t(`${m}.name`)}</span>
              {on && (
                <span className={CHIP_OK}>
                  <Check className="size-3.5" strokeWidth={2} aria-hidden />
                  {t('active')}
                </span>
              )}
              {soon && <span className={CHIP_NEUTRAL}>{t('soon')}</span>}
            </span>
            <span className="text-xs text-au-muted">{t(`${m}.hint`)}</span>
          </button>
        );
      })}
    </div>
  );
}

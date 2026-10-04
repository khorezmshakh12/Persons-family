'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { CHIP_OK } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { currentMotionLevel, MOTION_LEVELS, setMotionLevel, subscribeMotionLevel } from '@/lib/motion-level';

/** Settings › Motion: off / calm / full, per device. */
export function MotionSettingsCard() {
  const t = useTranslations('motionSettings');
  const level = useSyncExternalStore(subscribeMotionLevel, currentMotionLevel, () => 'calm' as const);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {MOTION_LEVELS.map((l) => {
        const on = l === level;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={on}
            onClick={() => setMotionLevel(l)}
            className={cn(
              'btn-motion flex flex-col gap-1 rounded-au-ctl border bg-au-card p-4 text-left',
              on ? 'border-au-accent ring-2 ring-au-accent' : 'border-au-line hover:shadow-au-card-hover',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-au-ink">{t(`${l}.name`)}</span>
              {on && (
                <span className={CHIP_OK}>
                  <Check className="size-3.5" strokeWidth={2} aria-hidden />
                  {t('active')}
                </span>
              )}
            </span>
            <span className="text-xs text-au-muted">{t(`${l}.hint`)}</span>
          </button>
        );
      })}
    </div>
  );
}

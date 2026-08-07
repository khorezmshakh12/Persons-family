'use client';

import { useTranslations } from 'next-intl';
import { Minus, Plus } from 'lucide-react';
import { useBackground, MIN_GLASS_BLUR, MAX_GLASS_BLUR } from './background-context';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

const STEP = 2;

export function GlassBlurControl() {
  const t = useTranslations('settings');
  const { glassBlur, setGlassBlur } = useBackground();

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => setGlassBlur(glassBlur - STEP)}
        disabled={glassBlur <= MIN_GLASS_BLUR}
        aria-label={t('blurDecrease')}
        className={cn(
          GLASS_CARD,
          GLASS_INTERACTIVE,
          'tap-scale flex size-9 shrink-0 items-center justify-center rounded-full text-white disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        <Minus className="size-4" />
      </button>

      <input
        type="range"
        min={MIN_GLASS_BLUR}
        max={MAX_GLASS_BLUR}
        step={STEP}
        value={glassBlur}
        onChange={(e) => setGlassBlur(Number(e.target.value))}
        aria-label={t('blurLabel')}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-teal-400"
      />

      <button
        type="button"
        onClick={() => setGlassBlur(glassBlur + STEP)}
        disabled={glassBlur >= MAX_GLASS_BLUR}
        aria-label={t('blurIncrease')}
        className={cn(
          GLASS_CARD,
          GLASS_INTERACTIVE,
          'tap-scale flex size-9 shrink-0 items-center justify-center rounded-full text-white disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        <Plus className="size-4" />
      </button>

      <span className="w-10 shrink-0 text-right text-sm tabular-nums text-white/70">{glassBlur}px</span>
    </div>
  );
}

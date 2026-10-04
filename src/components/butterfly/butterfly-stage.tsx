'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ButterflyCanvas } from './butterfly-canvas';

/**
 * The /butterfly stage with a full-screen toggle. Uses the Fullscreen API
 * where it exists; iPhone Safari (and webviews without it) get a fixed,
 * viewport-filling overlay instead. Esc / the button leaves either mode.
 */
export function ButterflyStage() {
  const t = useTranslations('butterfly');
  const ref = useRef<HTMLDivElement>(null);
  const [native, setNative] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const on = native || overlay;

  useEffect(() => {
    const sync = () => setNative(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOverlay(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [overlay]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
    if (overlay) return setOverlay(false);
    if (el.requestFullscreen && document.fullscreenEnabled) {
      el.requestFullscreen().catch(() => setOverlay(true));
    } else {
      setOverlay(true);
    }
  }, [overlay]);

  const Icon = on ? Minimize2 : Maximize2;
  const label = on ? t('exitFullscreen') : t('fullscreen');

  return (
    <div
      ref={ref}
      className={cn(
        'relative overflow-hidden bg-black',
        overlay
          ? 'fixed inset-0 z-[1000] h-dvh w-screen'
          : native
            ? 'h-full w-full'
            : 'h-[calc(100dvh-6rem)] min-h-[360px] rounded-au-card',
      )}
    >
      <ButterflyCanvas variant="full" className="cursor-grab active:cursor-grabbing" />
      {!on && (
        <div className="pointer-events-none absolute inset-x-0 top-0 p-4 sm:p-6">
          <h1 className="text-lg font-bold text-white/90 sm:text-xl">{t('title')}</h1>
          <p className="text-xs text-white/60 sm:text-sm">{t('subtitle')}</p>
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className="btn-motion absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <Icon className="size-5" strokeWidth={2} aria-hidden />
      </button>
      {!on && (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-center text-xs text-white/50">{t('hint')}</p>
      )}
    </div>
  );
}

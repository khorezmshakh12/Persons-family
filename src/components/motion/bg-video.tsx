'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { currentTheme, subscribeTheme, THEME_SWATCHES, type ThemeId } from '@/lib/themes';
import { currentBg, readStoredBg, subscribeBg, type BgMode } from '@/lib/bg-mode';
import { currentMotionLevel, subscribeMotionLevel } from '@/lib/motion-level';

/**
 * Moving abstract background (public/bg/<theme>.webm|mp4|jpg — seamless
 * 16 s loops rendered with ffmpeg, ~30 KB WebM each). One per theme.
 *
 *  site  — fixed behind the whole app, under a page-colour scrim so text
 *          stays readable; the cards themselves stay opaque.
 *  hero  — fills a gradient hero / page header (the parent needs
 *          `relative isolate overflow-hidden`).
 *  login — fixed behind the sign-in screen, always Aurora.
 *
 * The poster frame always paints first and stays if the video can't or
 * shouldn't play: motion level 'off' (which folds in reduced-motion),
 * Save-Data / 2G, or a hidden tab (paused). Muted + playsInline so mobile
 * browsers autoplay it.
 */
export function BgVideo({ variant, theme }: { variant: 'site' | 'hero' | 'login'; theme?: ThemeId }) {
  const live = useSyncExternalStore(subscribeTheme, currentTheme, () => 'aurora' as ThemeId);
  const id: ThemeId = theme ?? live;
  const level = useSyncExternalStore(subscribeMotionLevel, currentMotionLevel, () => 'off' as const);
  // Settings › Orqa fon. The login screen has no boot script, so fall back to
  // this device's stored choice there.
  const mode = useSyncExternalStore<BgMode>(
    subscribeBg,
    () => (document.documentElement.hasAttribute('data-bg') ? currentBg() : readStoredBg()),
    () => 'off',
  );
  const ref = useRef<HTMLVideoElement>(null);
  const [lowData, setLowData] = useState(false);

  useEffect(() => {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    // Login has no motion-level boot script, so reduced-motion is checked here too.
    const still = c?.saveData || /(^|-)2g$/.test(c?.effectiveType ?? '') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time capability read after mount
    if (still) setLowData(true);
  }, []);

  const play = level !== 'off' && !lowData;

  useEffect(() => {
    const v = ref.current;
    if (!v || !play) return;
    const sync = () => {
      if (document.visibilityState === 'hidden') v.pause();
      else void v.play().catch(() => {});
    };
    // Off-screen heroes don't need to decode.
    const io =
      variant === 'hero' && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => (e?.isIntersecting ? sync() : v.pause()))
        : null;
    io?.observe(v);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      io?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [play, variant, id, mode]);

  // ?v bumps whenever the loops are re-rendered, so browsers drop the old files.
  const base =
    mode === 'aquarium' ? `/staff/bg/aquarium/${THEME_SWATCHES[id].dark ? 'dark' : 'light'}` : `/staff/bg/${id}`;
  const v = '?v=2';
  const fill = 'pointer-events-none h-full w-full object-cover';
  // Off (the default): nothing at all — heroes keep their gradient.
  if (mode === 'off') return null;
  const media = play ? (
    <video
      key={`${mode}-${id}`}
      ref={ref}
      className={fill}
      poster={`${base}.jpg${v}`}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      tabIndex={-1}
    >
      <source src={`${base}.webm${v}`} type="video/webm" />
      <source src={`${base}.mp4${v}`} type="video/mp4" />
    </video>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- decorative still, already tiny
    <img src={`${base}.jpg${v}`} alt="" aria-hidden className={fill} />
  );

  if (variant === 'hero') {
    return <div className="absolute inset-0 -z-10">{media}</div>;
  }
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {media}
      {/* Scrim: the motion reads as light, the page as calm. */}
      <div className={cn('absolute inset-0', variant === 'site' ? 'bg-au-bg/40' : 'bg-au-bg/20')} />
    </div>
  );
}

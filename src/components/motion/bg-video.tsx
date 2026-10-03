'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { currentTheme, subscribeTheme, type ThemeId } from '@/lib/themes';
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
  }, [play, variant, id]);

  const base = `/staff/bg/${id}`;
  const fill = 'pointer-events-none h-full w-full object-cover';
  const media = play ? (
    <video
      key={id}
      ref={ref}
      className={fill}
      poster={`${base}.jpg`}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      tabIndex={-1}
    >
      <source src={`${base}.webm`} type="video/webm" />
      <source src={`${base}.mp4`} type="video/mp4" />
    </video>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- decorative still, already tiny
    <img src={`${base}.jpg`} alt="" aria-hidden className={fill} />
  );

  if (variant === 'hero') {
    return <div className="absolute inset-0 -z-10 opacity-90">{media}</div>;
  }
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {media}
      {/* Scrim: the motion reads as light, the page as calm. */}
      <div className={cn('absolute inset-0', variant === 'site' ? 'bg-au-bg/70' : 'bg-au-bg/35')} />
    </div>
  );
}

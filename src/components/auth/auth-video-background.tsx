'use client';

import { useEffect, useRef } from 'react';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_115001_bcdaa3b4-03de-47e7-ad63-ae3e392c32d4.mp4';

const FADE_MS = 500;
const FADE_OUT_LEAD_S = 0.55;

/**
 * Loops the login-screen background video with a hand-rolled opacity fade
 * (rAF-driven, not a CSS transition) instead of the native `loop` attribute:
 * fades in on load/loop-restart, starts fading out 0.55s before the clip
 * ends, then on `ended` snaps to 0, rewinds, replays, and fades back in.
 * `fadingOutRef` stops repeated `timeupdate` ticks inside that last 0.55s
 * window from each re-triggering their own fade-out; every fade cancels
 * whatever rAF is already running and continues from the current opacity
 * rather than jumping, so an interrupted fade doesn't visibly snap.
 */
export function AuthVideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const opacityRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function setOpacity(value: number) {
      opacityRef.current = value;
      if (video) video.style.opacity = String(value);
    }

    function fade(target: number) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const start = opacityRef.current;
      const startTime = performance.now();

      function step(now: number) {
        const t = Math.min((now - startTime) / FADE_MS, 1);
        setOpacity(start + (target - start) * t);
        rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
      }
      rafRef.current = requestAnimationFrame(step);
    }

    function handlePlay() {
      fadingOutRef.current = false;
      fade(1);
    }

    function handleTimeUpdate() {
      if (fadingOutRef.current || !video) return;
      if (video.duration - video.currentTime <= FADE_OUT_LEAD_S) {
        fadingOutRef.current = true;
        fade(0);
      }
    }

    function handleEnded() {
      setOpacity(0);
      window.setTimeout(() => {
        if (!video) return;
        video.currentTime = 0;
        void video.play();
      }, 100);
    }

    video.addEventListener('play', handlePlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={VIDEO_SRC}
      autoPlay
      muted
      playsInline
      className="absolute inset-0 h-full w-full translate-y-[17%] object-cover"
      style={{ opacity: 0 }}
    />
  );
}

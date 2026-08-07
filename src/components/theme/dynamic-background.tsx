'use client';

import Image from 'next/image';
import { useBackground } from './background-context';

// The one non-preset, non-flat background: a fullscreen looping clip
// instead of a static photo. Kept as a plain constant rather than a
// PRESET_THEMES-style entry since it needs its own <video> element and
// colour-harmony treatment, not next/image.
const CINEMATIC_VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

export function DynamicBackground() {
  const { backgroundUrl, themeMode } = useBackground();

  if (themeMode === 'video') {
    return (
      <>
        <div className="fixed inset-0 -z-20 bg-slate-900">
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
            src={CINEMATIC_VIDEO_URL}
          />
        </div>
        {/* Colour-harmony veil: ties the clip's own palette back to this
            app's dark teal/glass theme (GLASS_CARD, the teal-400/emerald-500
            accents used everywhere) rather than letting the footage read as
            an unrelated layer. The slow pulse keeps the background quietly
            alive even where the video itself is momentarily still. */}
        <div className="animate-ambient-pulse fixed inset-0 -z-10 bg-gradient-to-b from-black/60 via-teal-950/25 to-black/70 mix-blend-multiply" />
        <div className="fixed inset-0 -z-10 bg-black/30" />
      </>
    );
  }

  // Custom uploads are a client-generated data: URI — there's no remote
  // resource for the optimizer to fetch/resize, so they skip it entirely.
  // The Nature preset is a real Unsplash URL and gets full next/image
  // treatment (resize, format conversion, responsive `sizes`).
  const isDataUrl = backgroundUrl.startsWith('data:');

  return (
    <>
      {/* bg-slate-900 shows instantly under a loading image so the page
          never flashes blank white while the photo downloads. `fixed`
          makes this the containing block next/image's `fill` needs. */}
      <div className="fixed inset-0 -z-20 bg-slate-900">
        <Image
          key={backgroundUrl}
          src={backgroundUrl}
          alt=""
          fill
          priority
          quality={75}
          sizes="100vw"
          unoptimized={isDataUrl}
          className="object-cover object-center"
        />
      </div>
      {/* A constant dark scrim keeps white glass text legible regardless of
          how bright the chosen photo is. */}
      <div className="fixed inset-0 -z-10 bg-black/35" />
    </>
  );
}

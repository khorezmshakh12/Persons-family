'use client';

import Image from 'next/image';
import { useBackground } from './background-context';
import { VIDEO_THEMES, DEFAULT_VIDEO_THEME_ID } from '@/lib/background-themes';
import { AnimatedAmbientLayer } from './animated-ambient-layer';

export function DynamicBackground() {
  const { backgroundUrl, themeMode, videoThemeId, activeDesignId } = useBackground();

  if (themeMode === 'video') {
    const videoTheme =
      VIDEO_THEMES.find((v) => v.id === videoThemeId) ??
      VIDEO_THEMES.find((v) => v.id === DEFAULT_VIDEO_THEME_ID)!;
    return (
      <>
        <div className="fixed inset-0 -z-20 bg-slate-900">
          <video
            key={videoTheme.url}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
            src={videoTheme.url}
          />
        </div>
        {videoTheme.overlay && (
          <>
            <div className="animate-ambient-pulse fixed inset-0 -z-10 bg-gradient-to-b from-black/60 via-teal-950/25 to-black/70 mix-blend-multiply" />
            <div className="fixed inset-0 -z-10 bg-black/30" />
          </>
        )}
      </>
    );
  }

  // Non-photo designs (e.g. living mesh, cyber, bento, neumorphism)
  const isNonPhotoDesign =
    activeDesignId === 'aurora_mesh' ||
    activeDesignId === 'neumorphism' ||
    activeDesignId === 'cyber_minimal' ||
    activeDesignId === 'bento_modern';

  if (isNonPhotoDesign) {
    return (
      <>
        <AnimatedAmbientLayer />
        <div className="fixed inset-0 -z-10 bg-black/20 pointer-events-none" />
      </>
    );
  }

  const isDataUrl = backgroundUrl?.startsWith('data:');

  return (
    <>
      <div className="fixed inset-0 -z-20 bg-slate-900">
        {backgroundUrl && (
          <Image
            key={backgroundUrl}
            src={backgroundUrl}
            alt=""
            fill
            priority
            quality={80}
            sizes="100vw"
            unoptimized={isDataUrl}
            className="object-cover object-center transition-opacity duration-700"
          />
        )}
      </div>
      <AnimatedAmbientLayer />
      <div className="fixed inset-0 -z-10 bg-black/35 pointer-events-none" />
    </>
  );
}

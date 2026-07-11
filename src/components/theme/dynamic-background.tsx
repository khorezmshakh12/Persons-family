'use client';

import Image from 'next/image';
import { useBackground } from './background-context';

export function DynamicBackground() {
  const { backgroundUrl, themeMode } = useBackground();
  // A flat theme replaces the photo/glass system entirely — nothing to
  // paint here, globals.css's [data-flat-theme] rules handle everything.
  if (themeMode !== 'photo') return null;

  // Custom uploads are a client-generated data: URI — there's no remote
  // resource for the optimizer to fetch/resize, so they skip it entirely.
  // The five preset themes are real Unsplash URLs and get full next/image
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

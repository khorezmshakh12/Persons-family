'use client';

import { preload } from 'react-dom';
import { useBackground } from './background-context';

export function DynamicBackground() {
  const { backgroundUrl } = useBackground();

  // Called during render (not in an effect) so it also runs on the server
  // pass: the very first HTML response already carries a
  // <link rel="preload" as="image"> for the default background, letting the
  // browser start fetching it before the <div> with backgroundImage even
  // exists. Re-running on every backgroundUrl change preloads a newly
  // chosen theme/upload ahead of the CSS transition picking it up.
  preload(backgroundUrl, { as: 'image', fetchPriority: 'high' });

  return (
    <>
      {/* bg-slate-900 shows instantly under a transparent/loading image so
          the page never flashes blank white while the photo downloads. */}
      <div
        className="fixed inset-0 -z-20 bg-slate-900 bg-cover bg-center bg-fixed transition-all duration-500"
        style={{ backgroundImage: `url(${backgroundUrl})` }}
      />
      {/* A constant dark scrim keeps white glass text legible regardless of
          how bright the chosen photo is. */}
      <div className="fixed inset-0 -z-10 bg-black/35" />
    </>
  );
}

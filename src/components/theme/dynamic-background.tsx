'use client';

import { useBackground } from './background-context';

export function DynamicBackground() {
  const { backgroundUrl } = useBackground();

  return (
    <>
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center bg-fixed transition-all duration-500"
        style={{ backgroundImage: `url(${backgroundUrl})` }}
      />
      {/* A constant dark scrim keeps white glass text legible regardless of
          how bright the chosen photo is. */}
      <div className="fixed inset-0 -z-10 bg-black/35" />
    </>
  );
}

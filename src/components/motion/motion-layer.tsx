'use client';

import { useSyncExternalStore } from 'react';
import { currentMotionLevel, subscribeMotionLevel } from '@/lib/motion-level';
import { useTilt } from './use-tilt';
import { useConfetti } from './use-confetti';
import { ScrollProgress } from './scroll-progress';
import { DynamicIsland } from './dynamic-island';

/**
 * Client half of MOTION v3. Mounted for everyone; its overlays render only
 * at the 'full' motion level (Settings › Harakat).
 * Renders only overlays (scroll bar, island) — it wraps nothing, so it can
 * never hide real UI.
 */
export function MotionLayer() {
  // Mounted for everyone; the extras only run at the 'full' motion level.
  const full = useSyncExternalStore(subscribeMotionLevel, () => currentMotionLevel() === 'full', () => false);
  useTilt();
  useConfetti();

  if (!full) return null;
  return (
    <>
      <ScrollProgress />
      <DynamicIsland />
    </>
  );
}

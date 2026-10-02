'use client';

import { useTilt } from './use-tilt';
import { useConfetti } from './use-confetti';
import { ScrollProgress } from './scroll-progress';
import { DynamicIsland } from './dynamic-island';

/**
 * Client half of MOTION v3. Mounted by the (app) layout ONLY for
 * MOTION_ROLES, so none of these listeners/overlays exist for anyone else.
 * Renders only overlays (scroll bar, island) — it wraps nothing, so it can
 * never hide real UI.
 */
export function MotionLayer() {
  useTilt();
  useConfetti();

  return (
    <>
      <ScrollProgress />
      <DynamicIsland />
    </>
  );
}

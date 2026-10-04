'use client';

import { useEffect } from 'react';
import { applyMotionLevel, readStoredMotionLevel, type MotionLevel } from '@/lib/motion-level';

/** Client-side arrivals (e.g. signing in) don't run the inline boot script —
 * apply the motion level here too, and clear it when the signed-in area
 * unmounts so the login screen is left neutral. */
export function MotionSync({ roleDefault }: { roleDefault: MotionLevel }) {
  useEffect(() => {
    applyMotionLevel(readStoredMotionLevel(roleDefault));
    return () => {
      document.documentElement.removeAttribute('data-motion-level');
      document.documentElement.removeAttribute('data-motion');
    };
  }, [roleDefault]);
  return null;
}

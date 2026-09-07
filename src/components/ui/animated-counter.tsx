'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { durations } from '@/lib/motion';

/**
 * Ease-out curve for the count-up, applied to linear progress `t` in [0, 1].
 *
 * A real cubic-bezier ease needs the curve's x(t) solved for each frame's
 * elapsed fraction; feeding elapsed time straight in as the bezier parameter
 * gives a different (and wrong) curve. This is the standard easeOutCubic
 * instead — cheap, strictly monotonic, f(0) = 0, f(1) = 1 — which is close
 * enough in feel to the emphasized ease for a number ticking up.
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function AnimatedCounter({
  value,
  duration = durations.slow,
  formatter,
  className,
}: {
  value: number | string;
  duration?: number;
  formatter?: (val: number) => string;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();
  const rawString = String(value);

  // Extract numeric part if string contains numbers (e.g. "4,500,000 UZS" or "100%")
  const match = rawString.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  const numericTarget = match ? parseFloat(match[0]) : null;

  const [displayValue, setDisplayValue] = useState<number>(() => numericTarget ?? 0);
  const prevTargetRef = useRef<number>(numericTarget ?? 0);

  useEffect(() => {
    if (numericTarget === null || shouldReduce) {
      return;
    }

    const startVal = prevTargetRef.current;
    const endVal = numericTarget;
    prevTargetRef.current = endVal;

    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    let startTimestamp: number | null = null;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      const easedProgress = easeOutCubic(progress);
      const current = startVal + (endVal - startVal) * easedProgress;

      setDisplayValue(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(endVal);
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [numericTarget, duration, shouldReduce]);

  if (numericTarget === null) {
    return <span className={className}>{rawString}</span>;
  }

  const activeValue = shouldReduce ? numericTarget : displayValue;

  if (formatter) {
    return <span className={className}>{formatter(activeValue)}</span>;
  }

  // Format with intact prefix / suffix
  const isInteger = Number.isInteger(numericTarget);
  const formattedNumber = isInteger
    ? Math.round(activeValue).toLocaleString()
    : activeValue.toFixed(1);

  const rendered = rawString.replace(match![0], formattedNumber);
  return <span className={className}>{rendered}</span>;
}

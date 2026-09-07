/**
 * Motion System Tokens & Primitives
 *
 * Central design tokens for framer-motion animations across the app.
 * Built for tactile, physical, spring-based interactions with 60fps performance
 * and full prefers-reduced-motion: reduce accessibility.
 *
 * Spring Tokens:
 * - snappy: { stiffness: 400, damping: 32 } - Fast, crisp, no-overshoot response for buttons, tabs, reorders.
 * - bouncy: { stiffness: 520, damping: 20 } - Tactile pop/drop with overshoot for cards, badges, star moments.
 * - gentle: { stiffness: 210, damping: 26 } - Smooth, organic expansion for accordions, column toggles.
 *
 * Durations:
 * - fast: 0.12s (micro-interactions, icon rotations)
 * - base: 0.2s (route transitions, standard fades)
 * - slow: 0.32s (stat counters, large card moves)
 *
 * Easings:
 * - standard: [0.2, 0, 0, 1]
 * - emphasized: [0.05, 0.7, 0.1, 1]
 */

import { useReducedMotion, type Transition, type Variants } from 'framer-motion';

export const durations = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
} as const;

export const springs = {
  snappy: { type: 'spring', stiffness: 400, damping: 32 } as const,
  bouncy: { type: 'spring', stiffness: 520, damping: 20 } as const,
  gentle: { type: 'spring', stiffness: 210, damping: 26 } as const,
} as const;

export const easings = {
  standard: [0.2, 0, 0, 1] as [number, number, number, number],
  emphasized: [0.05, 0.7, 0.1, 1] as [number, number, number, number],
} as const;

/** Standard entrance / exit variants */
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: springs.snappy },
  exit: { opacity: 0, y: -8, transition: { duration: durations.fast, ease: easings.standard } },
};

export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: springs.bouncy },
  exit: { opacity: 0, scale: 0.9, transition: { duration: durations.fast } },
};

export const staggerContainer: Variants = {
  initial: { opacity: 1 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.02,
    },
  },
};

export const accordion: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: springs.gentle,
      opacity: { duration: durations.base, ease: easings.standard },
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: springs.gentle,
      opacity: { duration: durations.fast, ease: easings.standard },
    },
  },
};

/**
 * Backdrop scrim for overlays (dialogs, sheets, drawers).
 *
 * Only `opacity` animates. The blur is held *static* at `blur(12px)` across
 * initial/animate/exit so the compositor rasterises the blurred layer once and
 * merely fades it — animating `backdropFilter` instead forces a full-viewport
 * backdrop re-blur on every frame, which is one of the most expensive things a
 * page can do. Consumers get a pre-blurred scrim that fades in and out.
 */
export const overlayScrim: Variants = {
  initial: { opacity: 0, backdropFilter: 'blur(12px)' },
  animate: {
    opacity: 1,
    backdropFilter: 'blur(12px)',
    transition: { duration: durations.base, ease: easings.emphasized },
  },
  exit: {
    opacity: 0,
    backdropFilter: 'blur(12px)',
    transition: { duration: durations.fast, ease: easings.standard },
  },
};

/** Reduced-motion variants for accessibility */
export const reducedFadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: durations.fast } },
  exit: { opacity: 0, transition: { duration: durations.fast } },
};

export const reducedAccordion: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1, transition: { duration: 0 } },
  exit: { height: 0, opacity: 0, transition: { duration: 0 } },
};

/**
 * Hook providing motion tokens and variants with automatic reduced-motion fallback.
 */
export function useMotion() {
  const shouldReduce = useReducedMotion();

  const getTransition = (transition: Transition): Transition => {
    if (shouldReduce) {
      return { duration: 0 };
    }
    return transition;
  };

  return {
    shouldReduce,
    durations,
    springs: {
      snappy: getTransition(springs.snappy),
      bouncy: getTransition(springs.bouncy),
      gentle: getTransition(springs.gentle),
    },
    easings,
    variants: {
      fadeInUp: shouldReduce ? reducedFadeIn : fadeInUp,
      popIn: shouldReduce ? reducedFadeIn : popIn,
      staggerContainer: shouldReduce
        ? { initial: { opacity: 1 }, animate: { opacity: 1, transition: { staggerChildren: 0, delayChildren: 0 } } }
        : staggerContainer,
      accordion: shouldReduce ? reducedAccordion : accordion,
      overlayScrim: shouldReduce
        ? {
            initial: { opacity: 0, backdropFilter: 'blur(12px)' },
            animate: { opacity: 1, backdropFilter: 'blur(12px)', transition: { duration: 0 } },
            exit: { opacity: 0, backdropFilter: 'blur(12px)', transition: { duration: 0 } },
          }
        : overlayScrim,
    },
  };
}

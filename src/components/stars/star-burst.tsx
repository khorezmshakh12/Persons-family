'use client';

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type Particle = {
  id: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  delay: number;
};

export function StarBurst({
  active = false,
  count = 8,
  className,
}: {
  active?: boolean;
  count?: number;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => {
      const pseudoRand1 = ((i * 9301 + 49297) % 233280) / 233280;
      const pseudoRand2 = ((i * 49297 + 9301) % 233280) / 233280;
      const angle = (i * 2 * Math.PI) / count + (pseudoRand1 * 0.4 - 0.2);
      const distance = 28 + pseudoRand2 * 20;
      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        scale: 0.6 + pseudoRand1 * 0.4,
        rotation: pseudoRand2 * 180 - 90,
        delay: (i % 3) * 0.03,
      };
    });
  }, [count]);

  if (!active || shouldReduce) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible z-20 ${className ?? ''}`}>
      {particles.map((p) => (
        <motion.svg
          key={p.id}
          viewBox="0 0 24 24"
          initial={{
            x: 0,
            y: 0,
            scale: 0,
            opacity: 1,
            rotate: 0,
          }}
          animate={{
            x: p.x,
            y: p.y,
            scale: [0, p.scale, 0],
            opacity: [1, 1, 0],
            rotate: p.rotation,
          }}
          transition={{
            duration: 0.6,
            delay: p.delay,
            ease: [0.2, 0.8, 0.2, 1],
          }}
          className="absolute size-3.5 fill-amber-300 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </motion.svg>
      ))}
    </div>
  );
}

export function StarMomentBadge({
  stars,
  delta,
  className,
}: {
  stars: number;
  delta?: number;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();
  const isPositive = delta != null && delta > 0;
  const isNegative = delta != null && delta < 0;

  return (
    <motion.div
      initial={false}
      animate={
        shouldReduce
          ? {}
          : isPositive
            ? { scale: [1, 1.28, 1] }
            : isNegative
              ? { y: [0, 4, 0] }
              : {}
      }
      transition={{ type: 'spring', stiffness: 520, damping: 20 }}
      className={`relative inline-flex items-center gap-1 ${className ?? ''}`}
    >
      <StarBurst active={isPositive} />
      <motion.svg
        viewBox="0 0 24 24"
        className="size-4 fill-amber-300 text-amber-300"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </motion.svg>
      <span className="font-semibold tabular-nums">{stars}</span>
    </motion.div>
  );
}

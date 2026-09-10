'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * The little burst of sparks fired at a card's landing spot when it's
 * dragged into another column. Rendered by TaskBoard at a fixed screen
 * position for ~0.6s, then it removes itself.
 *
 * Deterministic per-instance geometry (seeded off `x`+`y`, not a render-time
 * random) so the sparks are stable across the one or two renders this lives
 * for. The animation and hidden-under-reduced-motion live in globals.css
 * (`.task-spark` / `@keyframes task-spark-fly`).
 */
const SPARK_COUNT = 14;
const LIFETIME_MS = 650;

export function TaskMoveBurst({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setGone(true);
      onDone();
    }, LIFETIME_MS);
    return () => window.clearTimeout(id);
  }, [onDone]);

  const sparks = useMemo(() => {
    // Deterministic per-(drop point, index, salt) hash — no Math.random()
    // and no mutable PRNG state, so the burst renders identically across the
    // one or two renders it lives for.
    const noise = (i: number, salt: number) => {
      const v = Math.sin(x * 12.9898 + y * 78.233 + i * 37.719 + salt * 3.113) * 43758.5453;
      return v - Math.floor(v);
    };
    return Array.from({ length: SPARK_COUNT }, (_, i) => {
      const angle = (i / SPARK_COUNT) * Math.PI * 2 + noise(i, 1) * 0.5;
      const distance = 26 + noise(i, 2) * 34;
      return {
        sx: Math.cos(angle) * distance,
        // Bias upward so it reads as a firework, not an even splat.
        sy: Math.sin(angle) * distance - 14,
        // Teal -> emerald -> gold spread.
        hue: 150 + Math.round(noise(i, 3) * 60),
        delay: noise(i, 4) * 60,
      };
    });
  }, [x, y]);

  if (gone) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[200]"
      style={{ left: x, top: y }}
    >
      {sparks.map((s, i) => (
        <span
          key={i}
          className="task-spark"
          style={
            {
              '--sx': `${s.sx}px`,
              '--sy': `${s.sy}px`,
              '--shue': String(s.hue),
              animationDelay: `${s.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

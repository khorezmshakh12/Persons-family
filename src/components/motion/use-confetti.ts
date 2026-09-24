'use client';

import { useEffect } from 'react';
import { CELEBRATE_EVENT } from './events';

/** Palette comes from the Aurora tokens (no hex in components). */
const COLOR_TOKENS = ['--au-chart-1', '--au-chart-2', '--au-accent-text', '--au-ok', '--au-info', '--au-bad'];
const DURATION = 1600;

/**
 * Confetti burst from the last pointer-down position (or screen centre)
 * whenever `celebrate()` fires. A throwaway, pointer-events:none canvas that
 * removes itself after ~1.6s. Skipped entirely under reduced motion.
 */
export function useConfetti() {
  useEffect(() => {
    let lastX = window.innerWidth / 2;
    let lastY = window.innerHeight / 2;
    const live = new Set<HTMLCanvasElement>();

    function onDown(e: PointerEvent) {
      lastX = e.clientX;
      lastY = e.clientY;
    }

    function burst() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (live.size >= 2) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.cssText = `position:fixed;inset:0;width:${w}px;height:${h}px;pointer-events:none;z-index:150`;
      const g = canvas.getContext('2d');
      if (!g) return;
      document.body.appendChild(canvas);
      live.add(canvas);
      g.scale(dpr, dpr);
      const css = getComputedStyle(document.documentElement);
      const colors = COLOR_TOKENS.map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
      if (colors.length === 0) colors.push('orange');
      const x0 = lastX;
      const y0 = lastY;
      const parts = Array.from({ length: 110 }, () => ({
        x: x0,
        y: y0,
        vx: (Math.random() - 0.5) * 13,
        vy: -Math.random() * 12 - 4,
        s: 4 + Math.random() * 6,
        r: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4,
        c: colors[(Math.random() * colors.length) | 0],
        rect: Math.random() < 0.5,
      }));
      const t0 = performance.now();
      const done = () => {
        canvas.remove();
        live.delete(canvas);
      };
      // Hard stop even if rAF is throttled (background tab).
      const safety = window.setTimeout(done, DURATION + 500);
      const frame = (now: number) => {
        if (!canvas.isConnected) return;
        const k = (now - t0) / DURATION;
        g.clearRect(0, 0, w, h);
        for (const p of parts) {
          p.vy += 0.38;
          p.vx *= 0.985;
          p.x += p.vx;
          p.y += p.vy;
          p.r += p.vr;
          g.save();
          g.globalAlpha = Math.max(0, 1 - k);
          g.translate(p.x, p.y);
          g.rotate(p.r);
          g.fillStyle = p.c;
          if (p.rect) g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
          else {
            g.beginPath();
            g.arc(0, 0, p.s / 2.6, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
        }
        if (k < 1) requestAnimationFrame(frame);
        else {
          window.clearTimeout(safety);
          done();
        }
      };
      requestAnimationFrame(frame);
    }

    document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    window.addEventListener(CELEBRATE_EVENT, burst);
    return () => {
      document.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener(CELEBRATE_EVENT, burst);
      for (const c of live) c.remove();
      live.clear();
    };
  }, []);
}

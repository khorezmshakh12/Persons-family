'use client';

import { useEffect, useRef, useState } from 'react';
import { motionAllowed } from '@/lib/motion-level';

const NUM = /-?\d[\d\s  ,.]*/;

/**
 * Counts the first number inside a pre-formatted string up from 0 when it
 * scrolls into view ("5 255 000", "11%", "9 ★", "+300 000"), keeping the
 * surrounding text and the thousands separator. The server render — and the
 * resting state — is always the real value; motion level 'off' or no number
 * just shows it. Re-counts from the old value when `value` changes.
 */
export function CountUp({ value, duration = 900 }: { value: string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);

  useEffect(() => {
    const m = NUM.exec(value);
    const target = m ? Number(m[0].replace(/[\s  ,]/g, '').replace(/\.(?=.*\.)/g, '')) : NaN;
    if (!m || !Number.isFinite(target) || !motionAllowed('calm')) {
      prev.current = Number.isFinite(target) ? target : null;
      setShown(value);
      return;
    }
    const raw = m[0].trimEnd();
    const sep = /\d([\s  ,])\d{3}/.exec(raw)?.[1] ?? ' ';
    const decimals = /\.(\d+)$/.exec(raw)?.[1].length ?? 0;
    const fmt = (n: number) => {
      const fixed = Math.abs(n).toFixed(decimals);
      const [int, frac] = fixed.split('.');
      const grouped = Number(int) >= 10000 || /\d[\s  ,]\d{3}/.test(raw) ? int.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : int;
      return (n < 0 ? '-' : '') + grouped + (frac ? `.${frac}` : '');
    };
    const from = prev.current ?? 0;
    prev.current = target;
    if (from === target) {
      setShown(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const run = () => {
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(value.replace(m[0].trimEnd(), fmt(from + (target - from) * eased)));
        if (p < 1) raf = requestAnimationFrame(tick);
        else setShown(value);
      };
      raf = requestAnimationFrame(tick);
    };
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      run();
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {shown}
    </span>
  );
}

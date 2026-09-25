'use client';

import { useEffect, type RefObject } from 'react';

/* =====================================================================
   Motion kit — the prototype's "MOTION PRO" layer, delegated.
   Works purely through CSS classes + observers on the suite root, so it
   applies to /strategy, /accounting, /operations and /perforce without
   touching their components. Never hides real UI: every entrance is
   transform/blur-only (or a brief partial fade on chart marks), classes
   are removed on animationend with a timeout fallback, and nothing runs
   under prefers-reduced-motion.
   ===================================================================== */

type Snd = (k: 'open' | 'close') => void;

const COUNT_SEL = '.v,.big,.cnum,.num,.val,.ctr b,.legend b,.kv b,.mini b,.vbars b,b,strong';
const NUM = /\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;
const SKIP = /\d{1,2}[./]\d{1,2}[./]\d{2,4}|\b(19|20)\d{2}\b|\d-[a-z]|\d{1,2}:\d{2}/i;
const GX = '.tr i,.hb i,.bar span,.bar i,.fill,.mg-bar,.bgt-track > *,.sx-hbar i,.sx-hbar span,.track > i,.track > span';
const GY = 'svg rect.b,.vbars span,.cac-hb i';
const expo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const anim = (el: Element) => getComputedStyle(el).animationName !== 'none';

function fmt(tok: string, k: number) {
  const sep = /[   ]/.exec(tok)?.[0];
  const d = /([.,])(\d+)$/.exec(sep ? tok.replace(/[   ]/g, '') : tok);
  const v = parseFloat(tok.replace(/[   ]/g, '').replace(',', '.')) * k;
  const [i, f] = v.toFixed(d ? d[2].length : 0).split('.');
  const int = sep ? i.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : i;
  return f ? int + d![1] + f : int;
}

const counted = new WeakSet<Element>();
/** 0 → value count-up; yields to React the moment it re-renders the text. */
function countUp(el: HTMLElement, delay: number) {
  if (counted.has(el)) return;
  counted.add(el);
  const nodes: { n: Text; src: string; last: string }[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    const s = n.nodeValue ?? '';
    if (/\d/.test(s) && !SKIP.test(s) && s.length <= 32) nodes.push({ n, src: s, last: s });
  }
  if (!nodes.length) return;
  el.classList.add('sx-cu');
  const t0 = performance.now() + delay;
  const step = (now: number) => {
    const p = Math.max(0, Math.min(1, (now - t0) / 1100));
    const k = expo(p);
    let alive = false;
    for (const o of nodes) {
      if (o.n.nodeValue !== o.last) continue;
      const next = p >= 1 ? o.src : o.src.replace(NUM, (t) => fmt(t, k));
      o.n.nodeValue = next;
      o.last = next;
      alive = true;
    }
    if (p < 1 && alive) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Add a one-shot animation class, cleaned up on end (or after 2.6s). */
function once(el: Element, cls: string, i?: number, after?: () => void) {
  const h = el as HTMLElement;
  h.classList.add(cls);
  if (i !== undefined) h.style.setProperty('--i', String(i));
  let t = 0;
  const end = (e?: Event) => {
    if (e && e.target !== el) return;
    clearTimeout(t);
    h.classList.remove(cls);
    h.style.removeProperty('--i');
    el.removeEventListener('animationend', end);
    after?.();
  };
  el.addEventListener('animationend', end);
  t = window.setTimeout(end, 2600);
}

/** Numbers count up, lines draw, bars grow, dots fade — inside one card. */
function animateIn(card: HTMLElement, replay: boolean) {
  let c = 0;
  card.querySelectorAll<HTMLElement>(COUNT_SEL).forEach((el) => {
    if (c > 24 || el.childElementCount || el.closest('input,textarea,[contenteditable="true"]')) return;
    const t = el.textContent?.trim() ?? '';
    if (t.length > 24 || !/\d/.test(t)) return;
    c++;
    countUp(el, 150);
  });
  // Existing CSS entrances already ran while the card was off-screen — replay them.
  if (replay && 'getAnimations' in card) {
    card.getAnimations({ subtree: true }).forEach((a) => {
      const tgt = (a.effect as KeyframeEffect | null)?.target;
      if (tgt === card || a.playState !== 'finished' || a.effect?.getTiming().iterations === Infinity) return;
      a.currentTime = 0;
      a.play();
    });
  }
  card.querySelectorAll('svg path, svg line').forEach((p) => {
    if (p.closest('.sx-mm,.sx-mind') || anim(p)) return;
    const cs = getComputedStyle(p);
    if (cs.stroke === 'none' || cs.strokeDasharray !== 'none' || (p.tagName === 'path' && cs.fill !== 'none')) return;
    const own = !p.hasAttribute('pathLength');
    if (own) p.setAttribute('pathLength', '1');
    once(p, 'sx-m-draw', undefined, () => own && p.removeAttribute('pathLength'));
  });
  card.querySelectorAll('svg polyline').forEach((p) => !anim(p) && once(p, 'sx-m-fade'));
  let ci = 0;
  card.querySelectorAll('svg circle').forEach((el) => {
    if (el.closest('.dn,.ring,.donut,.sx-mm') || anim(el)) return;
    once(el, 'sx-m-fade', Math.min(ci++, 14));
  });
  let gx = 0;
  card.querySelectorAll(GX).forEach((el) => !anim(el) && once(el, 'sx-m-gx', Math.min(gx++, 12)));
  let gy = 0;
  card.querySelectorAll(GY).forEach((el) => !anim(el) && once(el, 'sx-m-gy', Math.min(gy++, 12)));
  card.querySelectorAll('.dn svg,.ring svg,.donut svg').forEach((s) => !anim(s) && once(s, 'sx-m-sp'));
}

export function useMotionKit(rootRef: RefObject<HTMLElement | null>, sound: Snd) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const mountAt = performance.now();
    const seen = new WeakSet<Element>();
    let batch = 0;
    let bt = 0;

    const io = new IntersectionObserver(
      (es) => {
        const vis = es
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        clearTimeout(bt);
        const replay = performance.now() - mountAt > 900;
        vis.forEach((e) => {
          const c = e.target as HTMLElement;
          io.unobserve(c);
          const d = batch++ * 70;
          c.style.setProperty('--d', `${d}ms`);
          once(c, 'sx-rv-in', undefined, () => c.style.removeProperty('--d'));
          setTimeout(() => animateIn(c, replay), Math.max(0, d - 40));
        });
        bt = window.setTimeout(() => (batch = 0), 120);
      },
      { threshold: 0.08 },
    );

    const scan = () => {
      root.querySelectorAll<HTMLElement>('.sx-card').forEach((c) => {
        if (seen.has(c) || c.parentElement?.closest('.sx-card,.sx-drawer,.sx-mm-tools,[role="dialog"]')) return;
        seen.add(c);
        io.observe(c);
      });
    };
    scan();

    // Intro: header pieces stagger in (transform-only).
    root.querySelectorAll('.sx-secbar,.sx-title,.sx-pill,.sx-flow,.sx-tabs').forEach((el, i) => {
      if (!anim(el)) once(el, 'sx-rs', i);
    });

    let raf = 0;
    const mo = new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'attributes') {
          const t = m.target as HTMLElement;
          if (!t.classList?.contains('sx-drawer')) continue;
          const was = /\bopen\b/.test(m.oldValue ?? '');
          const is = t.classList.contains('open');
          if (was !== is) sound(is ? 'open' : 'close');
        } else if (!raf) raf = requestAnimationFrame(() => ((raf = 0), scan()));
      }
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(bt);
    };
  }, [rootRef, sound]);
}

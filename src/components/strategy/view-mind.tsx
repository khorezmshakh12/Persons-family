'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from './suite-shell';
import { CheckSquare, Maximize, Minus, Plus, X } from 'lucide-react';
import { MIND_COLORS, guessWorkstream, type StrategyMind } from '@/lib/strategy';
import type { WorkspaceApi } from './strategy-workspace';

type P = [number, number];
type Sel = { root: true } | { b: number; k: number | null } | null;

/** Filled bezier "brush stroke" that tapers from w0 to w1. */
function taper(p0: P, c1: P, c2: P, p1: P, w0: number, w1: number) {
  const L: P[] = [];
  const R: P[] = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1];
    const dx = 3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p1[0] - c2[0]);
    const dy = 3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p1[1] - c2[1]);
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const w = (w0 + (w1 - w0) * t) / 2;
    L.push([x + nx * w, y + ny * w]);
    R.push([x - nx * w, y - ny * w]);
  }
  const f = (p: P) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  return `M${L.map(f).join(' L')} L${R.reverse().map(f).join(' L')} Z`;
}
const centerline = (p0: P, c1: P, c2: P, p1: P, flip: boolean) =>
  flip ? `M${p1} C${c2} ${c1} ${p0}` : `M${p0} C${c1} ${c2} ${p1}`;

function layoutMind(mind: StrategyMind, collapsed: Record<number, boolean>) {
  const n = mind.ch.length || 1;
  return mind.ch.map((b, i) => {
    const a = ((-60 + (i * 360) / n) * Math.PI) / 180;
    const dir: P = [Math.cos(a), Math.sin(a)];
    const R1 = 250;
    const E: P = [dir[0] * R1 * 1.45, dir[1] * R1];
    const perp: P = [-dir[1], dir[0]];
    const bend = (i % 2 ? 1 : -1) * 40;
    const c1: P = [dir[0] * R1 * 0.55 + perp[0] * bend, dir[1] * R1 * 0.4 + perp[1] * bend];
    const c2: P = [E[0] - dir[0] * 120 - perp[0] * bend * 0.6, E[1] - dir[1] * 80 - perp[1] * bend * 0.6];
    const kids = collapsed[i]
      ? []
      : b.ch.map((c, j, arr) => {
          const aa = a + (j - (arr.length - 1) / 2) * ((34 * Math.PI) / 180);
          const d2: P = [Math.cos(aa), Math.sin(aa)];
          const P1: P = [E[0] + d2[0] * 175 * 1.2, E[1] + d2[1] * 175];
          const pp: P = [-d2[1], d2[0]];
          return {
            c,
            j,
            a: aa,
            p0: E,
            c1: [E[0] + d2[0] * 60 + pp[0] * 14, E[1] + d2[1] * 40 + pp[1] * 14] as P,
            c2: [P1[0] - d2[0] * 70, P1[1] - d2[1] * 40] as P,
            p1: P1,
          };
        });
    return { b, i, a, p0: [dir[0] * 95, dir[1] * 50] as P, c1, c2, p1: E, kids };
  });
}

const HOME = { x: 0, y: 40, k: 0.78 };

export function MindView({
  api,
  mind,
  onChange,
}: {
  api: WorkspaceApi;
  mind: StrategyMind;
  onChange: (m: StrategyMind) => void;
}) {
  const [sel, setSel] = useState<Sel>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [vp, setVp] = useState(HOME);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [panning, setPanning] = useState(false);
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Non-passive wheel listener so the page doesn't scroll while zooming.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setVp((m) => {
        const k = Math.min(2.2, Math.max(0.35, m.k * (e.deltaY < 0 ? 1.1 : 0.9)));
        const px = e.clientX - r.left - r.width / 2 - m.x;
        const py = e.clientY - r.top - r.height / 2 - m.y;
        return { x: m.x - px * (k / m.k - 1), y: m.y - py * (k / m.k - 1), k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const L = layoutMind(mind, collapsed);
  const selName =
    sel && ('root' in sel ? mind.t : sel.k != null ? mind.ch[sel.b]?.ch[sel.k]?.t : mind.ch[sel.b]?.t);

  function hit(target: EventTarget | null): Sel {
    const g = (target as Element | null)?.closest?.('[data-br]') as HTMLElement | null;
    if (!g) return null;
    if (g.dataset.root) return { root: true };
    return { b: Number(g.dataset.b), k: g.dataset.k != null ? Number(g.dataset.k) : null };
  }

  function add() {
    const v = text.trim();
    if (!v) return;
    if (!sel) return toast.message('Avval shox yoki markazni tanlang');
    if ('root' in sel) {
      const next = {
        ...mind,
        ch: [...mind.ch, { t: v, c: MIND_COLORS[mind.ch.length % MIND_COLORS.length], ws: guessWorkstream(v), ch: [] }],
      };
      onChange(next);
      setSel({ b: next.ch.length - 1, k: null });
    } else if (sel.k == null) {
      onChange({ ...mind, ch: mind.ch.map((b, i) => (i === sel.b ? { ...b, ch: [...b.ch, { t: v }] } : b)) });
      setCollapsed((c) => ({ ...c, [sel.b]: false }));
    } else return toast.message('Faqat 2 daraja: asosiy shoxni tanlang');
    setText('');
    toast.success(`«${v}» qo‘shildi`);
  }

  function remove() {
    if (!sel || 'root' in sel) return;
    if (sel.k != null)
      onChange({ ...mind, ch: mind.ch.map((b, i) => (i === sel.b ? { ...b, ch: b.ch.filter((_, j) => j !== sel.k) } : b)) });
    else onChange({ ...mind, ch: mind.ch.filter((_, i) => i !== sel.b) });
    setSel(null);
  }

  function toTask() {
    if (!sel || 'root' in sel) return toast.message("Shox yoki g'oyani tanlang");
    const B = mind.ch[sel.b];
    const title = sel.k != null ? B.ch[sel.k].t : B.t;
    api.openTask(null, { title, workstream: B.ws ?? guessWorkstream(title) });
  }

  const isSel = (b: number, k: number | null) => sel && !('root' in sel) && sel.b === b && sel.k === k;

  return (
    <div className="relative h-full">
      <div
        ref={boxRef}
        className={`sx-mm ${panning ? 'panning' : ''}`}
        onPointerDown={(e) => {
          pan.current = { x: e.clientX, y: e.clientY, ox: vp.x, oy: vp.y, moved: false };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = pan.current;
          if (!p) return;
          const dx = e.clientX - p.x;
          const dy = e.clientY - p.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) {
            p.moved = true;
            setPanning(true);
          }
          setVp((m) => ({ ...m, x: p.ox + dx, y: p.oy + dy }));
        }}
        onPointerUp={(e) => {
          const p = pan.current;
          pan.current = null;
          setPanning(false);
          if (!p || p.moved) return;
          const el = document.elementFromPoint(e.clientX, e.clientY);
          setSel(hit(el));
        }}
        onDoubleClick={(e) => {
          const s = hit(document.elementFromPoint(e.clientX, e.clientY));
          if (s && !('root' in s) && s.k == null) setCollapsed((c) => ({ ...c, [s.b]: !c[s.b] }));
        }}
      >
        <svg width="100%" height="100%">
          <g transform={`translate(${size.w / 2 + vp.x} ${size.h / 2 + vp.y}) scale(${vp.k})`}>
            {L.map((B) => {
              const col = B.b.c;
              const flip = Math.cos(B.a) < 0;
              return (
                <g key={`b${B.i}`} className="sx-mm-branch" style={{ animationDelay: `${B.i * 80}ms` }}>
                  {B.kids.map((K) => {
                    const f2 = Math.cos(K.a) < 0;
                    const id = `k${B.i}-${K.j}`;
                    const d = centerline(K.p0, K.c1, K.c2, K.p1, f2);
                    return (
                      <g key={id} data-br="1" data-b={B.i} data-k={K.j} className="br">
                        <path d={taper(K.p0, K.c1, K.c2, K.p1, 9, 2.5)} fill={col} opacity={0.9} />
                        <path id={id} d={d} fill="none" />
                        <path d={d} fill="none" stroke="transparent" strokeWidth={26} />
                        <text fontSize={13} fill="var(--au-ink)" dy={-9} textAnchor="middle">
                          <textPath href={`#${id}`} startOffset={f2 ? '42%' : '58%'}>
                            {K.c.t}
                          </textPath>
                        </text>
                        <circle cx={K.p1[0]} cy={K.p1[1]} r={5} fill="var(--au-card)" stroke={col} strokeWidth={3} />
                        {isSel(B.i, K.j) && <circle className="sel-ring" cx={K.p1[0]} cy={K.p1[1]} r={14} />}
                      </g>
                    );
                  })}
                  <g data-br="1" data-b={B.i} className="br">
                    <path d={taper(B.p0, B.c1, B.c2, B.p1, 30, 8)} fill={col} />
                    <path id={`m${B.i}`} d={centerline(B.p0, B.c1, B.c2, B.p1, flip)} fill="none" />
                    <path d={centerline(B.p0, B.c1, B.c2, B.p1, flip)} fill="none" stroke="transparent" strokeWidth={40} />
                    <text fontSize={16} fontWeight={600} fill="var(--au-ink)" dy={-18} textAnchor="middle">
                      <textPath href={`#m${B.i}`} startOffset={flip ? '40%' : '60%'}>
                        {B.b.t}
                      </textPath>
                    </text>
                    {collapsed[B.i] && (
                      <>
                        <circle cx={B.p1[0]} cy={B.p1[1]} r={13} fill={col} />
                        <text x={B.p1[0]} y={B.p1[1] + 4} textAnchor="middle" fontSize={11} fill="#fff">
                          +{B.b.ch.length}
                        </text>
                      </>
                    )}
                    {isSel(B.i, null) && <circle className="sel-ring" cx={B.p1[0]} cy={B.p1[1]} r={20} />}
                  </g>
                </g>
              );
            })}
            <g data-br="1" data-root="1" className="br sx-mm-root" transform="rotate(-3)">
              <rect x={-115} y={-49} width={240} height={108} rx={6} fill="var(--au-ink)" opacity={0.9} />
              <rect x={-120} y={-54} width={240} height={108} rx={6} fill="#ffd166" stroke="#17161a" strokeWidth={3} />
              <text x={0} y={8} textAnchor="middle" fontSize={24} fill="#17161a" className="sx-serif">
                {mind.t || 'Strategiya'}
              </text>
              {sel && 'root' in sel && <rect className="sel-ring" x={-132} y={-66} width={264} height={132} rx={10} />}
            </g>
          </g>
        </svg>
      </div>

      <div className="sx-mm-tools">
        <div className="sx-card zoom">
          <button onClick={() => setVp((m) => ({ ...m, k: Math.max(0.35, m.k * 0.87) }))} title="Kichraytirish">
            <Minus className="size-4" />
          </button>
          <span className="tabular-nums">{Math.round(vp.k * 100)}%</span>
          <button onClick={() => setVp((m) => ({ ...m, k: Math.min(2.2, m.k * 1.15) }))} title="Kattalashtirish">
            <Plus className="size-4" />
          </button>
          <button onClick={() => setVp(HOME)} title="Markazga">
            <Maximize className="size-4" />
          </button>
        </div>
        <div className="sx-card edit">
          <span className="selname">
            {selName ? (
              <>
                Tanlangan: <b>{selName}</b>
              </>
            ) : (
              'Shox tanlang'
            )}
          </span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            maxLength={80}
            placeholder={
              !sel
                ? 'Avval shox tanlang'
                : 'root' in sel
                  ? 'Yangi asosiy shox… (Enter)'
                  : sel.k != null
                    ? "Bu darajada qo'shib bo'lmaydi"
                    : "Yangi g'oya… (Enter)"
            }
          />
          <button className="sx-btn sm" onClick={toTask} title="Tanlangan g'oyani vazifaga aylantirish">
            <CheckSquare className="size-3.5" />
            Vazifaga
          </button>
          <button className="sx-btn sm" onClick={remove} title="O'chirish" disabled={!sel || 'root' in sel}>
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="sx-mm-hint">
        Sudrab siljiting · <kbd>scroll</kbd> zoom · shoxni <kbd>2×</kbd> bosing — yig‘ish
      </div>
    </div>
  );
}

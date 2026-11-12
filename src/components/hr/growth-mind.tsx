'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize, Minus, Pencil, Plus, X } from 'lucide-react';
import { ask, toast } from '@/components/strategy/suite-shell';
import { MIND_COLORS } from '@/lib/strategy';
import { countNodes, findNode, growthId, mapNode, type GrowthMind, type MindNode } from '@/lib/hr-growth';

/**
 * HR mind map — the same brush-stroke map as Strategy › Mind map
 * (components/strategy/view-mind.tsx), but any branch takes children, to any
 * depth. Level 1 and 2 use Strategy's exact geometry; deeper levels keep
 * fanning out from their parent's tip with shorter, thinner strokes.
 */

type P = [number, number];
type Laid = { n: MindNode; depth: number; a: number; p0: P; c1: P; c2: P; p1: P; col: string; kids: Laid[] };

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

const DEG = Math.PI / 180;

function layoutKids(parent: { n: MindNode; a: number; p1: P; depth: number; col: string }, collapsed: Record<string, boolean>): Laid[] {
  if (collapsed[parent.n.id]) return [];
  const m = parent.n.ch.length;
  const depth = parent.depth + 1;
  const E = parent.p1;
  return parent.n.ch.map((c, j) => {
    let aa: number;
    let P1: P;
    let c1: P;
    let c2: P;
    if (depth === 2) {
      // Strategy's exact second level.
      aa = parent.a + (j - (m - 1) / 2) * 34 * DEG;
      const d2: P = [Math.cos(aa), Math.sin(aa)];
      P1 = [E[0] + d2[0] * 175 * 1.2, E[1] + d2[1] * 175];
      const pp: P = [-d2[1], d2[0]];
      c1 = [E[0] + d2[0] * 60 + pp[0] * 14, E[1] + d2[1] * 40 + pp[1] * 14];
      c2 = [P1[0] - d2[0] * 70, P1[1] - d2[1] * 40];
    } else {
      const spread = Math.max(14, 30 - 4 * (depth - 3)) * DEG;
      aa = parent.a + (j - (m - 1) / 2) * spread;
      const d: P = [Math.cos(aa), Math.sin(aa)];
      const len = 150 * Math.pow(0.86, depth - 3);
      P1 = [E[0] + d[0] * len * 1.15, E[1] + d[1] * len];
      const pp: P = [-d[1], d[0]];
      c1 = [E[0] + d[0] * 45 + pp[0] * 10, E[1] + d[1] * 30 + pp[1] * 10];
      c2 = [P1[0] - d[0] * 50, P1[1] - d[1] * 30];
    }
    const col = c.c ?? parent.col;
    const self = { n: c, depth, a: aa, p0: E, c1, c2, p1: P1, col, kids: [] as Laid[] };
    self.kids = layoutKids(self, collapsed);
    return self;
  });
}

function layoutMind(mind: GrowthMind, collapsed: Record<string, boolean>): Laid[] {
  const n = mind.ch.length || 1;
  return mind.ch.map((b, i) => {
    // Strategy's exact first level.
    const a = ((-60 + (i * 360) / n) * Math.PI) / 180;
    const dir: P = [Math.cos(a), Math.sin(a)];
    const R1 = 250;
    const E: P = [dir[0] * R1 * 1.45, dir[1] * R1];
    const perp: P = [-dir[1], dir[0]];
    const bend = (i % 2 ? 1 : -1) * 40;
    const c1: P = [dir[0] * R1 * 0.55 + perp[0] * bend, dir[1] * R1 * 0.4 + perp[1] * bend];
    const c2: P = [E[0] - dir[0] * 120 - perp[0] * bend * 0.6, E[1] - dir[1] * 80 - perp[1] * bend * 0.6];
    const col = b.c ?? MIND_COLORS[i % MIND_COLORS.length];
    const self = { n: b, depth: 1, a, p0: [dir[0] * 95, dir[1] * 50] as P, c1, c2, p1: E, col, kids: [] as Laid[] };
    self.kids = layoutKids(self, collapsed);
    return self;
  });
}

const HOME = { x: 0, y: 40, k: 0.78 };
const ROOT = 'root';

function Branch({ L, sel, collapsed, delay }: { L: Laid; sel: string | null; collapsed: Record<string, boolean>; delay?: number }) {
  const flip = Math.cos(L.a) < 0;
  const d = centerline(L.p0, L.c1, L.c2, L.p1, flip);
  const pid = `gm-${L.n.id}`;
  const top = L.depth === 1;
  const w0 = top ? 30 : L.depth === 2 ? 9 : 5;
  const w1 = top ? 8 : L.depth === 2 ? 2.5 : 1.5;
  const hidden = collapsed[L.n.id] ? countNodes(L.n.ch) : 0;
  return (
    <g className={top ? 'sx-mm-branch' : undefined} style={delay != null ? { animationDelay: `${delay}ms` } : undefined}>
      {L.kids.map((K) => (
        <Branch key={K.n.id} L={K} sel={sel} collapsed={collapsed} />
      ))}
      <g data-br="1" data-id={L.n.id} className="br">
        <path d={taper(L.p0, L.c1, L.c2, L.p1, w0, w1)} fill={L.col} opacity={top ? 1 : 0.9} />
        <path id={pid} d={d} fill="none" />
        <path d={d} fill="none" stroke="transparent" strokeWidth={top ? 56 : 30} />
        <text
          fontSize={top ? 16 : L.depth === 2 ? 13 : 12}
          fontWeight={top ? 600 : undefined}
          fill="var(--au-ink)"
          dy={top ? -18 : -9}
          textAnchor="middle"
          pointerEvents="bounding-box"
        >
          <textPath href={`#${pid}`} startOffset={flip ? (top ? '40%' : '42%') : top ? '60%' : '58%'}>
            {L.n.t}
          </textPath>
        </text>
        {!top && !hidden && <circle cx={L.p1[0]} cy={L.p1[1]} r={L.depth === 2 ? 5 : 4} fill="var(--au-card)" stroke={L.col} strokeWidth={3} />}
        {hidden > 0 && (
          <>
            <circle cx={L.p1[0]} cy={L.p1[1]} r={top ? 13 : 11} fill={L.col} />
            <text x={L.p1[0]} y={L.p1[1] + 4} textAnchor="middle" fontSize={11} fill="#fff">
              +{hidden}
            </text>
          </>
        )}
        {sel === L.n.id && <circle className="sel-ring" cx={L.p1[0]} cy={L.p1[1]} r={top ? 20 : 14} />}
      </g>
    </g>
  );
}

export function GrowthMindView({
  mind,
  rootLabel,
  readonly,
  onChange,
}: {
  mind: GrowthMind;
  rootLabel: string;
  readonly: boolean;
  onChange: (m: GrowthMind) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [vp, setVp] = useState(HOME);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [panning, setPanning] = useState(false);
  const [text, setText] = useState('');
  const [renaming, setRenaming] = useState(false);
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
        const k = Math.min(2.2, Math.max(0.2, m.k * (e.deltaY < 0 ? 1.1 : 0.9)));
        const px = e.clientX - r.left - r.width / 2 - m.x;
        const py = e.clientY - r.top - r.height / 2 - m.y;
        return { x: m.x - px * (k / m.k - 1), y: m.y - py * (k / m.k - 1), k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const L = layoutMind(mind, collapsed);
  const selNode = sel && sel !== ROOT ? findNode(mind.ch, sel) : undefined;
  const selName = sel === ROOT ? mind.t || rootLabel : selNode?.t;

  function hit(target: EventTarget | null): string | null {
    const g = (target as Element | null)?.closest?.('[data-br]') as HTMLElement | null;
    return g ? (g.dataset.id ?? null) : null;
  }

  function startRename() {
    if (!sel) return toast.message('Avval shox yoki markazni tanlang');
    setText(selName ?? '');
    setRenaming(true);
  }

  function rename() {
    const v = text.trim();
    if (!v || !sel) return;
    if (sel === ROOT) onChange({ ...mind, t: v });
    else onChange({ ...mind, ch: mapNode(mind.ch, sel, (n) => ({ ...n, t: v })) });
    setRenaming(false);
    setText('');
    toast.success('Nomi o‘zgartirildi');
  }

  function add() {
    if (renaming) return rename();
    const v = text.trim();
    if (!v) return;
    if (!sel) return toast.message('Avval shox yoki markazni tanlang');
    const node: MindNode = { id: growthId(), t: v, ch: [] };
    if (sel === ROOT) {
      onChange({ ...mind, ch: [...mind.ch, { ...node, c: MIND_COLORS[mind.ch.length % MIND_COLORS.length] }] });
    } else {
      onChange({ ...mind, ch: mapNode(mind.ch, sel, (n) => ({ ...n, ch: [...n.ch, node] })) });
      setCollapsed((c) => ({ ...c, [sel]: false }));
    }
    setText('');
    toast.success(`«${v}» qo‘shildi`);
  }

  async function remove() {
    if (!sel || sel === ROOT || !selNode) return;
    const kids = countNodes(selNode.ch);
    if (!(await ask(kids ? `«${selName}» va undagi ${kids} ta shox o'chirilsinmi?` : `«${selName}» o'chirilsinmi?`))) return;
    onChange({ ...mind, ch: mapNode(mind.ch, sel, () => null) });
    setSel(null);
  }

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
          setSel(hit(document.elementFromPoint(e.clientX, e.clientY)));
          setRenaming(false);
        }}
        onDoubleClick={(e) => {
          const s = hit(document.elementFromPoint(e.clientX, e.clientY));
          if (s && s !== ROOT && findNode(mind.ch, s)?.ch.length) setCollapsed((c) => ({ ...c, [s]: !c[s] }));
        }}
      >
        <svg width="100%" height="100%">
          <g transform={`translate(${size.w / 2 + vp.x} ${size.h / 2 + vp.y}) scale(${vp.k})`}>
            {L.map((B, i) => (
              <Branch key={B.n.id} L={B} sel={sel} collapsed={collapsed} delay={i * 80} />
            ))}
            <g data-br="1" data-id={ROOT} className="br sx-mm-root" transform="rotate(-3)">
              <rect x={-115} y={-49} width={240} height={108} rx={6} fill="var(--au-ink)" opacity={0.9} />
              <rect x={-120} y={-54} width={240} height={108} rx={6} fill="#ffd166" stroke="#17161a" strokeWidth={3} />
              <text x={0} y={8} textAnchor="middle" fontSize={24} fill="#17161a" className="sx-serif">
                {mind.t || rootLabel}
              </text>
              {sel === ROOT && <rect className="sel-ring" x={-132} y={-66} width={264} height={132} rx={10} />}
            </g>
          </g>
        </svg>
      </div>

      <div className="sx-mm-tools">
        <div className="sx-card zoom">
          <button onClick={() => setVp((m) => ({ ...m, k: Math.max(0.2, m.k * 0.87) }))} title="Kichraytirish">
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
        {readonly ? (
          <div className="sx-card edit">
            <span className="selname">{selName ? <>Tanlangan: <b>{selName}</b></> : 'Faqat ko‘rish'}</span>
          </div>
        ) : (
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
                if (e.key === 'Escape' && renaming) {
                  setRenaming(false);
                  setText('');
                }
              }}
              maxLength={120}
              placeholder={renaming ? 'Yangi nom… (Enter)' : !sel ? 'Avval shox tanlang' : sel === ROOT ? 'Yangi asosiy shox… (Enter)' : 'Ichiga yangi shox… (Enter)'}
            />
            <button className="sx-btn sm" onClick={add} disabled={!sel || !text.trim()} title={renaming ? 'Nomni saqlash' : "Qo'shish"}>
              {renaming ? 'Saqlash' : <Plus className="size-3.5" />}
            </button>
            <button className="sx-btn sm" onClick={startRename} disabled={!sel} title="Nomini o'zgartirish" aria-label="Nomini o'zgartirish">
              <Pencil className="size-3.5" />
            </button>
            <button className="sx-btn sm" onClick={remove} title="O'chirish" aria-label="O'chirish" disabled={!sel || sel === ROOT}>
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="sx-mm-hint">
        Sudrab siljiting · <kbd>scroll</kbd> zoom · shoxni <kbd>2×</kbd> bosing — yig‘ish
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { StrategyRoadmap, StrategyTask } from '@/lib/strategy';

type Node = { id: string; t: string; q?: string; main: boolean; x: number; y: number; w: number; h: number };
type Link = { x1: number; y1: number; x2: number; y2: number; main: boolean };

const W = 820;
const CX = W / 2;
const MW = 210;
const MH = 52;
const TW = 196;
const TH = 40;
const GAP_Y = 180;

function layout(r: StrategyRoadmap) {
  const nodes: Node[] = [];
  const links: Link[] = [];
  r.sections.forEach((sec, i) => {
    const y = 40 + i * GAP_Y;
    nodes.push({ id: sec.id, t: sec.t, q: sec.q, main: true, x: CX - MW / 2, y, w: MW, h: MH });
    if (i > 0) links.push({ x1: CX, y1: y - GAP_Y + MH, x2: CX, y2: y, main: true });
    (['left', 'right'] as const).forEach((side) =>
      sec[side].forEach((t, j) => {
        const x = side === 'left' ? 16 : W - 16 - TW;
        const ny = y - 30 + j * (TH + 18) + (MH / 2 - TH / 2) + 2;
        nodes.push({ id: `${sec.id}-${side[0]}${j}`, t, main: false, x, y: ny, w: TW, h: TH });
        links.push({
          x1: side === 'left' ? CX - MW / 2 : CX + MW / 2,
          y1: y + MH / 2,
          x2: side === 'left' ? x + TW : x,
          y2: ny + TH / 2,
          main: false,
        });
      }),
    );
  });
  return { nodes, links, H: 40 + r.sections.length * GAP_Y };
}

const path = (l: Link) =>
  l.main
    ? `M${l.x1} ${l.y1} L${l.x2} ${l.y2}`
    : `M${l.x1} ${l.y1} C${(l.x1 + l.x2) / 2} ${l.y1}, ${(l.x1 + l.x2) / 2} ${l.y2}, ${l.x2} ${l.y2}`;

export function RoadmapView({
  roadmaps,
  tasks,
  selected,
  onNode,
}: {
  roadmaps: StrategyRoadmap[];
  tasks: StrategyTask[];
  selected: string | null;
  onNode: (roadmapId: string, nodeId: string) => void;
}) {
  const [rmId, setRmId] = useState(roadmaps[0]?.id);
  const R = roadmaps.find((r) => r.id === rmId) ?? roadmaps[0];
  if (!R) return <p className="text-au-muted">Roadmap yo‘q</p>;

  const { nodes, links, H } = layout(R);
  const st = (id: string) => R.node_status[id] ?? 'todo';
  const topics = nodes.filter((n) => !n.main);
  const doneN = topics.filter((n) => st(n.id) === 'done').length;
  const progN = topics.filter((n) => st(n.id) === 'progress').length;
  const linkCount = (id: string) => tasks.filter((t) => t.roadmap_id === R.id && t.roadmap_node === id).length;
  const pct = topics.length ? Math.round((doneN / topics.length) * 100) : 0;

  return (
    <div className="sx-rm-wrap">
      <div className="sx-card rm">
        <div className="rm-canvas" style={{ width: W, height: H }}>
          <svg className="links" width={W} height={H}>
            {links.map((l, i) => (
              <path
                key={i}
                d={path(l)}
                fill="none"
                stroke={l.main ? 'var(--au-ink)' : '#2477c9'}
                strokeWidth={l.main ? 3 : 2}
                strokeDasharray={l.main ? undefined : '1 7'}
                strokeLinecap="round"
                className={l.main ? 'sx-draw' : 'sx-march'}
              />
            ))}
          </svg>
          {nodes.map((n, i) => {
            const c = linkCount(n.id);
            return (
              <button
                key={n.id}
                className={cn('rn', n.main ? 'main' : 'topic', st(n.id), selected === n.id && 'sel')}
                style={{ left: n.x, top: n.y, width: n.w, height: n.h, animationDelay: `${Math.min(i, 30) * 25}ms` }}
                onClick={() => onNode(R.id, n.id)}
              >
                {n.main && <span className="q">{n.q}</span>}
                <span className="truncate">{n.t}</span>
                {c > 0 && <span className="cnt">{c}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="rm-side">
        <div className="sx-card rm-pick">
          {roadmaps.map((r) => (
            <button key={r.id} className={cn(r.id === R.id && 'on')} onClick={() => setRmId(r.id)}>
              <span className="ic">{r.icon}</span>
              <span>
                {r.name}
                <small>{r.subtitle}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="sx-card rm-prog">
          <div className="ct">
            <h3>Progress</h3>
            <small>{topics.length} mavzu</small>
          </div>
          <div className="big tabular-nums">{pct}%</div>
          <div className="bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-au-muted">
            <b className="text-au-ok">{doneN}</b> bajarildi · <b className="text-au-accent-text">{progN}</b> jarayonda ·{' '}
            {topics.length - doneN - progN} qoldi
          </div>
        </div>
        <div className="sx-card">
          <div className="ct">
            <h3>Belgilar</h3>
          </div>
          <div className="rm-leg">
            <div>
              <i style={{ background: '#ffd166' }} />
              Asosiy bosqich
            </div>
            <div>
              <i style={{ background: 'var(--au-card)' }} />
              Mavzu / tashabbus
            </div>
            <div>
              <i style={{ background: '#e3f5ea', borderColor: '#139a52' }} />
              Bajarildi
            </div>
            <div>
              <i style={{ background: '#fff4e1', borderColor: '#ff9f1c' }} />
              Jarayonda
            </div>
            <div>
              <i style={{ background: 'var(--au-card)', opacity: 0.45 }} />
              O‘tkazib yuborildi
            </div>
          </div>
          <p className="mt-3 text-xs text-au-faint">
            Tugunni bosing: holatini belgilang, bog‘langan vazifalarni ko‘ring yoki yangisini yarating.
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useLayoutEffect, useRef, useState } from 'react';

type Tip = { x: number; y: number; html: React.ReactNode } | null;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const short = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${+(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : `${Math.round(a)}`;
  return (v < 0 ? '−' : '') + s;
};

export type Series = { n: string; c: string; v: number[]; kind?: 'line' | 'bar'; dash?: boolean };

/** Combined bar + line chart with a shared zero-based (or negative-aware)
 * axis and a hover column tooltip. */
export function Chart({
  labels,
  series,
  height = 220,
  fmt = short,
  refLine,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  fmt?: (v: number) => string;
  /** Dashed horizontal target line (e.g. the student goal). */
  refLine?: { v: number; t: string };
}) {
  const [tip, setTip] = useState<Tip>(null);
  // Draw at the container's real width so text and bars keep their size.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const pad = { l: 44, r: 10, t: 12, b: 24 };
  const all = [...series.flatMap((s) => s.v), ...(refLine ? [refLine.v] : [])].filter(Number.isFinite);
  const max = niceMax(Math.max(0, ...all));
  const minRaw = Math.min(0, ...all);
  const min = minRaw < 0 ? -niceMax(-minRaw) : 0;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = Math.max(1, labels.length);
  const x = (i: number) => pad.l + (iw / n) * (i + 0.5);
  const y = (v: number) => pad.t + ih * (1 - (v - min) / (max - min || 1));
  const bars = series.filter((s) => (s.kind ?? 'bar') === 'bar');
  const lines = series.filter((s) => s.kind === 'line');
  const bw = Math.min(28, (iw / n) * 0.7 / Math.max(1, bars.length));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => min + (max - min) * k);

  return (
    <div ref={box} className="sx-chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <g className="grid">
          {ticks.map((t) => (
            <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} strokeDasharray={t === 0 ? undefined : '3 4'} />
          ))}
        </g>
        <g className="axis">
          {ticks.map((t) => (
            <text key={t} x={pad.l - 6} y={y(t) + 3} textAnchor="end">
              {fmt(t)}
            </text>
          ))}
          {labels.map((l, i) =>
            n <= 14 || i % Math.ceil(n / 12) === 0 ? (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle">
                {l}
              </text>
            ) : null,
          )}
        </g>
        {refLine && (
          <g className="ref">
            <line x1={pad.l} x2={W - pad.r} y1={y(refLine.v)} y2={y(refLine.v)} stroke="var(--au-bad)" strokeDasharray="6 4" />
            <text x={W - pad.r} y={y(refLine.v) - 4} textAnchor="end" fill="var(--au-bad)" fontSize={10} fontWeight={700}>
              {refLine.t}
            </text>
          </g>
        )}
        {bars.map((s, si) =>
          s.v.map((v, i) => {
            const x0 = x(i) - (bw * bars.length) / 2 + si * bw;
            const top = y(Math.max(0, v));
            const h = Math.abs(y(v) - y(0));
            return (
              <rect
                key={`${si}-${i}`}
                className={`bar ${v < 0 ? 'neg' : ''}`}
                x={x0 + 1}
                y={top}
                width={bw - 2}
                height={Math.max(h, v !== 0 ? 1 : 0)}
                rx={3}
                fill={s.c}
                style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}
              />
            );
          }),
        )}
        {lines.map((s) => (
          <path
            key={s.n}
            className="line"
            pathLength={1}
            d={s.v
              .map((v, i) => (Number.isFinite(v) ? `${i && Number.isFinite(s.v[i - 1]) ? 'L' : 'M'}${x(i)} ${y(v)}` : ''))
              .join(' ')}
            stroke={s.c}
            strokeDasharray={s.dash ? '5 5' : undefined}
            style={s.dash ? { animation: 'none' } : undefined}
          />
        ))}
        {lines.map((s) =>
          s.v.map((v, i) =>
            Number.isFinite(v) ? <circle key={`${s.n}${i}`} cx={x(i)} cy={y(v)} r={3} fill="var(--au-card)" stroke={s.c} strokeWidth={2} /> : null,
          ),
        )}
        {labels.map((l, i) => (
          <rect
            key={`h${i}`}
            className="hot"
            x={pad.l + (iw / n) * i}
            y={pad.t}
            width={iw / n}
            height={ih}
            onMouseMove={(e) =>
              setTip({
                x: e.clientX + 14,
                y: e.clientY - 10,
                html: (
                  <>
                    <b>{l}</b>
                    {series.map((s) => (
                      <div key={s.n} className="flex items-center gap-2">
                        <i style={{ width: 8, height: 8, borderRadius: 2, background: s.c, display: 'inline-block' }} />
                        {s.n}: <b>{Number.isFinite(s.v[i]) ? fmt(s.v[i]) : '—'}</b>
                      </div>
                    ))}
                  </>
                ),
              })
            }
          />
        ))}
      </svg>
      <div className="sx-legend">
        {series.map((s) => (
          <span key={s.n}>
            <i style={{ background: s.c }} />
            {s.n}
          </span>
        ))}
      </div>
      {tip && (
        <div className="sx-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.html}
        </div>
      )}
    </div>
  );
}

/** Horizontal labelled bars (share of a total). */
export function HBars({ rows, fmt = short }: { rows: { n: string; v: number; c: string; sub?: string }[]; fmt?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={r.n}>
          <div className="mb-1 flex justify-between text-xs font-semibold">
            <span>{r.n}</span>
            <span className="tabular-nums text-au-muted">
              {fmt(r.v)}
              {r.sub ? ` · ${r.sub}` : ''}
            </span>
          </div>
          <div className="sx-hbar">
            <i style={{ width: `${(Math.abs(r.v) / max) * 100}%`, background: r.c, animationDelay: `${i * 60}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';

// Operation HQ › Statistika grafiklari (owner, 2026-11-23): plain SVG line
// and bar charts on Aurora tokens — one scale per chart, faint grid, the
// last point emphasised. Colours come from var(--au-*), never hex.

type Series = { name: string; data: (number | null)[]; color: string; area?: boolean };

const W = 640;

function niceStep(max: number): number {
  const raw = Math.max(1, max) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? raw;
}

function short(v: number, money?: boolean): string {
  if (!money) return String(Math.round(v * 10) / 10);
  if (Math.abs(v) >= 1e6) return `${Math.round(v / 1e5) / 10} mln`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)} ming`;
  return String(v);
}

function scale(values: number[], h: number, floor?: number) {
  const top = Math.max(1, ...values);
  const step = niceStep(top - (floor ?? 0));
  const min = floor ?? 0;
  const max = min + Math.ceil((top - min) / step) * step || min + step;
  const T = 14;
  const B = 22;
  const y = (v: number) => T + (h - T - B) * (1 - (v - min) / (max - min));
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);
  return { y, ticks };
}

function Axis({ labels, x, h, ticks, y, money }: { labels: string[]; x: (i: number) => number; h: number; ticks: number[]; y: (v: number) => number; money?: boolean }) {
  const every = Math.ceil(labels.length / 8);
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={36} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--au-line)" />
          <text x={30} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--au-faint)">
            {short(t, money)}
          </text>
        </g>
      ))}
      {labels.map((l, i) =>
        i % every === 0 || i === labels.length - 1 ? (
          <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize={10} fill="var(--au-faint)">
            {l}
          </text>
        ) : null,
      )}
    </>
  );
}

export function LineChart({ labels, series, height = 200, money, floor, label }: { labels: string[]; series: Series[]; height?: number; money?: boolean; floor?: number; label: string }) {
  const vals = series.flatMap((s) => s.data.filter((v): v is number => v != null));
  const lo = floor != null ? Math.min(floor, ...vals) : undefined;
  const { y, ticks } = scale(vals, height, lo);
  const x = (i: number) => 36 + (labels.length < 2 ? 0 : (i * (W - 44)) / (labels.length - 1));
  const base = y(ticks[0]);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
      <Axis labels={labels} x={x} h={height} ticks={ticks} y={y} money={money} />
      {series.map((s) => {
        const pts = s.data.map((v, i) => (v == null ? null : ([x(i), y(v)] as const))).filter((p): p is readonly [number, number] => !!p);
        if (!pts.length) return null;
        const line = pts.map((p) => p.join(',')).join(' ');
        const last = pts[pts.length - 1];
        const lastVal = s.data.filter((v): v is number => v != null).at(-1) ?? 0;
        return (
          <g key={s.name}>
            {s.area && <path d={`M${pts[0][0]},${base} L${line.replaceAll(' ', ' L')} L${last[0]},${base}Z`} fill={s.color} fillOpacity={0.1} />}
            <polyline points={line} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={last[0]} cy={last[1]} r={4} fill={s.color} />
            <text x={last[0] - 6} y={last[1] - 9} textAnchor="end" fontSize={11} fontWeight={700} fill={s.color}>
              {short(lastVal, money)}
            </text>
            <title>{s.name}</title>
          </g>
        );
      })}
    </svg>
  );
}

export function BarChart({ labels, series, height = 190, label }: { labels: string[]; series: Series[]; height?: number; label: string }) {
  const vals = series.flatMap((s) => s.data.map((v) => v ?? 0));
  const { y, ticks } = scale(vals, height);
  const bw = (W - 44) / labels.length;
  const inner = Math.min(14, (bw - 4) / series.length);
  const x = (i: number) => 36 + bw * i + bw / 2;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
      <Axis labels={labels} x={x} h={height} ticks={ticks} y={y} />
      {labels.map((l, i) =>
        series.map((s, j) => {
          const v = s.data[i] ?? 0;
          const bx = x(i) - (inner * series.length) / 2 + j * inner;
          return (
            <rect key={`${i}-${j}`} x={bx + 0.5} y={y(v)} width={Math.max(1, inner - 1.5)} height={Math.max(0, y(0) - y(v))} rx={2} fill={s.color}>
              <title>{`${l} · ${s.name}: ${v}`}</title>
            </rect>
          );
        }),
      )}
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3.5 text-xs text-au-muted">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

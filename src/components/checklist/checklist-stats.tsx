import { type JSX } from 'react';
import { Flame } from 'lucide-react';
import { SURFACE_CARD, SURFACE_INSET } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { ChecklistStats, DayStat } from '@/lib/checklist-stats';

const WEEKDAY_UZ = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh']; // getUTCDay 0..6

function weekdayShort(dayKey: string): string {
  return WEEKDAY_UZ[new Date(`${dayKey}T00:00:00Z`).getUTCDay()];
}

/** Today's completion as an SVG ring (uses currentColor so it tracks the
 * Aurora accent token without a hard-coded hex). */
function ProgressRing({ pct, size = 128 }: { pct: number; size?: number }): JSX.Element {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="text-au-accent">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--au-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-au-ink">{pct}%</span>
        <span className="text-[11px] text-au-muted">bugun</span>
      </div>
    </div>
  );
}

/** Last-7-days vertical bars; off-schedule days render as a faint dash. */
function WeekBars({ week }: { week: DayStat[] }): JSX.Element {
  return (
    <div className="flex items-end justify-between gap-1.5">
      {week.map((d) => (
        <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${d.date} · ${d.lesson ? `${d.done}/${d.total} · ${d.pct}%` : 'dars yo‘q'}`}>
          <div className="flex h-20 w-full items-end justify-center">
            {d.lesson ? (
              <div className="w-full max-w-7 overflow-hidden rounded-md bg-au-line">
                <div
                  className={cn('w-full rounded-md', d.pct >= 100 ? 'bg-au-accent' : 'bg-au-accent/60')}
                  style={{ height: `${Math.max(4, (d.pct / 100) * 80)}px` }}
                />
              </div>
            ) : (
              <div className="mb-1 h-0.5 w-4 rounded bg-au-line" />
            )}
          </div>
          <span className="text-[11px] text-au-muted">{weekdayShort(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

/** 30-day completion trend as an SVG area sparkline over lesson-days only
 * (off-schedule days are omitted rather than drawn as false 0% dips). */
function TrendChart({ trend }: { trend: DayStat[] }): JSX.Element {
  const pts = trend.filter((d) => d.lesson);
  if (pts.length < 2) {
    return <p className="py-6 text-center text-sm text-au-muted">Trend uchun ma’lumot hali yetarli emas.</p>;
  }
  const W = 300;
  const H = 84;
  const pad = 6;
  const step = (W - pad * 2) / (pts.length - 1);
  const y = (pct: number) => H - pad - (Math.min(100, pct) / 100) * (H - pad * 2);
  const coords = pts.map((d, i) => ({ x: pad + i * step, y: y(d.pct), d }));
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${H - pad} L${coords[0].x.toFixed(1)},${H - pad} Z`;
  const avg = Math.round(pts.reduce((s, d) => s + d.pct, 0) / pts.length);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-au-ink">Oxirgi 30 kun</span>
        <span className="text-xs font-semibold tabular-nums text-au-muted">o‘rtacha {avg}%</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full text-au-accent" preserveAspectRatio="none">
        <path d={area} fill="currentColor" fillOpacity={0.12} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c) => (
          <circle key={c.d.date} cx={c.x} cy={c.y} r={1.8} fill="currentColor">
            <title>{`${c.d.date} · ${c.d.pct}%`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function CadenceBar({ label, done, total }: { label: string; done: number; total: number }): JSX.Element {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn(SURFACE_INSET, 'flex flex-col gap-1.5 p-3')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-au-ink">{label}</span>
        <span className="text-xs tabular-nums text-au-muted">
          {done}/{total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-au-line">
        <div className="h-full rounded-full bg-au-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Full checklist statistics panel — the Checklist section's header card. */
export function ChecklistStats({ stats }: { stats: ChecklistStats }): JSX.Element {
  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-5 p-5')}>
      <h2 className="text-base font-bold text-au-ink">Statistika</h2>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Today ring + streak */}
        <div className="flex items-center gap-5">
          <ProgressRing pct={stats.today.lesson ? stats.today.pct : 0} />
          <div className="flex flex-col gap-2">
            <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-au-accent-soft px-2.5 py-1 text-sm font-bold text-au-accent-text">
              <Flame className="size-4" />
              {stats.streak} kun
            </div>
            <p className="text-xs text-au-muted">
              {stats.today.lesson
                ? `Bugun ${stats.today.done}/${stats.today.total} bajarildi`
                : 'Bugun dars yo‘q — kunlik talab qilinmaydi'}
            </p>
            <p className="text-xs text-au-faint">ketma-ket to‘liq kunlar</p>
          </div>
        </div>

        {/* Weekly bars */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-au-ink">Oxirgi 7 kun</span>
          <WeekBars week={stats.week} />
        </div>
      </div>

      {/* 30-day trend */}
      <TrendChart trend={stats.trend} />

      {/* Cadence breakdown */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CadenceBar label="Kunlik" done={stats.today.lesson ? stats.today.done : 0} total={stats.today.lesson ? stats.today.total : 0} />
        <CadenceBar label="Haftalik" done={stats.weekly.done} total={stats.weekly.total} />
        <CadenceBar label="Oylik" done={stats.monthly.done} total={stats.monthly.total} />
      </div>
    </div>
  );
}

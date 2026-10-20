import { type JSX } from 'react';
import { Flame } from 'lucide-react';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import type { ChecklistStats } from '@/lib/checklist-stats';

const WEEKDAY_UZ = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const weekdayShort = (dayKey: string) => WEEKDAY_UZ[new Date(`${dayKey}T00:00:00Z`).getUTCDay()];

/** Compact checklist statistics for the dashboard aside: today's ring, the
 * streak, and a 7-day mini bar chart. Links through to the full section. */
export function ChecklistStatsCompact({ stats, href }: { stats: ChecklistStats; href: string }): JSX.Element {
  const pct = stats.today.lesson ? stats.today.pct : 0;
  const size = 72;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);

  return (
    <section className={cn(SURFACE_CARD, 'flex min-w-0 flex-col gap-4 p-5')} aria-label="Checklist statistikasi">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-au-ink">Statistika</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-au-accent-soft px-2 py-0.5 text-xs font-bold text-au-accent-text">
          <Flame className="size-3.5" />
          {stats.streak} kun
        </span>
      </div>

      <div className="flex items-center gap-4">
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
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold tabular-nums text-au-ink">{pct}%</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-end justify-between gap-1">
          {stats.week.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date} · ${d.lesson ? `${d.pct}%` : 'dars yo‘q'}`}>
              <div className="flex h-12 w-full items-end justify-center">
                {d.lesson ? (
                  <div className="w-full max-w-5 overflow-hidden rounded bg-au-line">
                    <div
                      className={cn('w-full rounded', d.pct >= 100 ? 'bg-au-accent' : 'bg-au-accent/60')}
                      style={{ height: `${Math.max(3, (d.pct / 100) * 48)}px` }}
                    />
                  </div>
                ) : (
                  <div className="mb-0.5 h-0.5 w-3 rounded bg-au-line" />
                )}
              </div>
              <span className="text-[10px] text-au-muted">{weekdayShort(d.date)}</span>
            </div>
          ))}
        </div>
      </div>

      <Link href={href} className="text-xs font-semibold text-au-muted transition-colors hover:text-au-ink">
        Batafsil →
      </Link>
    </section>
  );
}

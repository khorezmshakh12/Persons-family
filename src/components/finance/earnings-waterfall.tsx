import { cn } from '@/lib/utils';

/** Salary + bonuses − penalties = total, as a four-column waterfall. Bars
 * grow from the baseline (motion-v4.css .au-spark rules reuse). */
export function EarningsWaterfall({
  salary,
  bonuses,
  penalties,
  total,
  labels,
}: {
  salary: number;
  bonuses: number;
  penalties: number;
  total: number;
  labels: { salary: string; bonuses: string; penalties: string; total: string };
}) {
  const top = Math.max(1, salary + Math.max(0, bonuses), total);
  const pct = (v: number) => `${(Math.max(0, v) / top) * 100}%`;
  const cols = [
    { key: 'salary', base: 0, size: salary, tone: 'bg-au-chart-3' },
    { key: 'bonuses', base: salary, size: bonuses, tone: 'bg-au-ok' },
    { key: 'penalties', base: salary + bonuses - penalties, size: penalties, tone: 'bg-au-bad' },
    { key: 'total', base: 0, size: total, tone: 'bg-au-accent' },
  ] as const;
  return (
    <div className="au-spark flex h-36 items-end gap-3 rounded-au-card border border-au-line bg-au-card p-4 shadow-au-card" role="img" aria-label={cols.map((c) => `${labels[c.key]}: ${c.size}`).join(', ')}>
      {cols.map((c) => (
        <div key={c.key} className="relative flex h-full flex-1 flex-col justify-end">
          <i
            className={cn('block rounded-[4px]', c.tone)}
            style={{ height: pct(c.size), marginBottom: pct(c.base), minHeight: c.size > 0 ? 4 : 0 }}
          />
          <span className="mt-2 truncate text-center text-[11px] font-medium text-au-muted">{labels[c.key]}</span>
        </div>
      ))}
    </div>
  );
}

import 'server-only';
import { sql } from '@/lib/db/client';
import { tashkentYmd } from '@/lib/time';
import { loadPayByMonth } from '@/lib/pay-run-data';
import {
  HORIZONS,
  addMonths,
  bpointProgress,
  bpointSeries,
  monthShort,
  monthsBetween,
  windowStart,
  type BpointProgress,
  type Horizon,
} from '@/lib/bpoint';

export type BpointGoalView = {
  horizon: Horizon;
  label: string;
  /** Window length in months (6 / 12 / 36). */
  months: number;
  /** Monthly target (0 = not set). */
  target: number;
  note: string | null;
  /** 'YYYY-MM-01' — first month of the window (from January, see windowStart). */
  start: string;
  /** 'YYYY-MM-01' — last month of the window. */
  end: string;
  /** The window is over (a new save starts the next one, see windowStart). */
  expired: boolean;
  progress: BpointProgress;
  /** Every month of the window; months not reached yet carry no amount. */
  bars: { label: string; year: string; amount: number | null }[];
};

/** One person's three B-nuqta goals (yarim yil / 1 yil / 3 yil), each over
 * its own window from the month it was set. The staff finance page, the
 * profile Finance tab and the pay run card all use this, so they agree. */
export async function loadBpointGoals(staffId: string): Promise<BpointGoalView[]> {
  const { year, month } = tashkentYmd();
  const now = `${year}-${String(month).padStart(2, '0')}-01`;
  const rows = await sql<{ horizon: Horizon; amount: number; start: string; note: string | null }[]>`
    select horizon, amount, to_char(start_period, 'YYYY-MM-DD') as start, note
    from staff_bpoint_goals where user_id = ${staffId}`;
  const byKey = new Map(rows.map((r) => [r.horizon, r]));

  // A goal not set yet shows the window it would get if saved now.
  const startOf = (h: (typeof HORIZONS)[number]) => byKey.get(h.key)?.start ?? windowStart(now, h.months);
  // One pay load covers every window: from the earliest start to this month.
  const starts = HORIZONS.map(startOf);
  const first = starts.reduce((a, b) => (b < a ? b : a), now);
  const points = await loadPayByMonth(first, now, staffId);

  return HORIZONS.map((h) => {
    const row = byKey.get(h.key);
    const start = startOf(h);
    const end = addMonths(start, h.months - 1);
    const reached = monthsBetween(start, now); // index of this month in the window
    const upTo = Math.min(reached, h.months - 1);
    const series = bpointSeries(points, start, h.months);
    const target = row?.amount ?? 0;
    return {
      horizon: h.key,
      label: h.label,
      months: h.months,
      target,
      note: row?.note ?? null,
      start,
      end,
      expired: reached > h.months - 1,
      progress: bpointProgress(target, series, upTo),
      bars: series.map((v, i) => {
        const p = addMonths(start, i);
        return { label: monthShort(p), year: p.slice(2, 4), amount: i <= upTo ? Math.round(v) : null };
      }),
    };
  });
}

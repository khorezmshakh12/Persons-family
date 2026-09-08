/**
 * The dashboard's stat-card maths, in one place.
 *
 * THE RULE every card obeys: a card is built *series-first*. One function
 * produces the metric's value at the end of each bucket in the selected
 * period; the headline is that series' last point, the sparkline is that
 * series, and the trend badge is that series' last-vs-previous change.
 * Nothing may measure the headline, the sparkline or the badge a second,
 * separate way — that divergence is what made these cards contradict each
 * other and contradict the pages they link to.
 *
 * Every bucket boundary is an Asia/Tashkent calendar boundary (the staff's
 * calendar) resolved to a UTC instant, never a UTC calendar boundary — the
 * server clock is UTC and a UTC month/day boundary is up to 5 hours off.
 */
import { tashkentDayKey, tashkentYmd, tashkentDayOfWeek, tashkentMidnight, addDaysToKey } from './time';

/** Bucket grain for every rate/growth figure on the dashboard. */
export type StatsPeriod = 'daily' | 'weekly' | 'monthly';

export const STATS_PERIODS = ['daily', 'weekly', 'monthly'] as const;

/** Monthly reproduces the behaviour the cards had before the toggle existed. */
export const DEFAULT_STATS_PERIOD: StatsPeriod = 'monthly';

/** How many buckets each grain draws. Chosen so the sparkline stays legible
 * at the card's fixed width and each grain covers a natural span: a week of
 * days, two months of weeks, half a year of months. */
export const PERIOD_BUCKETS: Record<StatsPeriod, number> = {
  daily: 7,
  weekly: 8,
  monthly: 6,
};

/** A series for each grain, so one server fetch feeds all three and the
 * client toggle is pure view state (no refetch, survives realtime refresh). */
export type PeriodSeries = Record<StatsPeriod, number[]>;

/**
 * Exclusive upper bound of each bucket, oldest → newest, as epoch ms.
 *
 * The LAST bound is deliberately in the future (end of today / of this week /
 * of this month), so the newest bucket includes everything up to "now". That
 * is what makes `lastPoint(series)` exactly equal the headline total a card
 * shows and the number the page it links to shows.
 *
 * - daily   — Tashkent calendar days, last bound = tomorrow 00:00 Tashkent
 * - weekly  — Monday-start Tashkent weeks, last bound = next Monday 00:00
 * - monthly — Tashkent calendar months, last bound = the 1st of next month
 */
export function periodBucketEnds(period: StatsPeriod, at: Date = new Date()): number[] {
  const count = PERIOD_BUCKETS[period];

  if (period === 'monthly') {
    const { year, month } = tashkentYmd(at); // month is 1-12
    return Array.from({ length: count }, (_, i) => {
      // Bucket i ends when the month after its own month starts.
      let m = month - (count - 1 - i) + 1;
      let y = year;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      return tashkentMidnight(`${y}-${String(m).padStart(2, '0')}-01`).getTime();
    });
  }

  const todayKey = tashkentDayKey(at);

  if (period === 'daily') {
    return Array.from({ length: count }, (_, i) =>
      tashkentMidnight(addDaysToKey(todayKey, i - (count - 1) + 1)).getTime(),
    );
  }

  // Weekly: Monday-start, matching lib/task-efficiency.ts's week windows.
  const daysSinceMonday = (tashkentDayOfWeek(at) + 6) % 7;
  const thisMonday = addDaysToKey(todayKey, -daysSinceMonday);
  return Array.from({ length: count }, (_, i) =>
    tashkentMidnight(addDaysToKey(thisMonday, (i - (count - 1)) * 7 + 7)).getTime(),
  );
}

/** Wire timestamps arrive as raw postgres strings (see lib/db/client.ts).
 * An unparseable or absent one is dropped rather than becoming NaN and
 * silently landing in — or falling out of — every bucket. */
function toMs(value: string | null | undefined): number {
  if (!value) return NaN;
  return new Date(value).getTime();
}

/**
 * Running row count as of the end of each bucket (oldest → newest).
 *
 * For a headline that is a *running total* ("Total Staff", "Active Groups").
 * Its last point equals the total number of rows handed in, so the headline,
 * the last sparkline bar and the trend badge cannot disagree.
 */
export function cumulativeCountSeries(
  timestamps: (string | null)[],
  period: StatsPeriod,
): number[] {
  const times = timestamps.map(toMs).filter((t) => Number.isFinite(t));
  return periodBucketEnds(period).map((end) =>
    times.reduce((n, t) => (t < end ? n + 1 : n), 0),
  );
}

/** A dated, signed money movement. `at` null = undated, and an undated row
 * cannot be placed on a timeline, so it is excluded from the series (and
 * therefore from the headline too — they are the same number). */
export type DatedAmount = { amount: number; at: string | null };

/**
 * Running net balance as of the end of each bucket (oldest → newest) — the
 * money counterpart of cumulativeCountSeries. Its last point is the net of
 * every dated entry, i.e. exactly the "net total" the finance page shows.
 */
export function cumulativeAmountSeries(entries: DatedAmount[], period: StatsPeriod): number[] {
  const rows = entries
    .map((e) => ({ t: toMs(e.at), a: Number(e.amount) || 0 }))
    .filter((r) => Number.isFinite(r.t));
  return periodBucketEnds(period).map((end) =>
    Math.round(rows.reduce((sum, r) => (r.t < end ? sum + r.a : sum), 0)),
  );
}

/** One item in an open/closed backlog. `openUntil` is the instant it stopped
 * being open (done/approved/rejected); `null` means it is still open now. */
export type BacklogItem = { createdAt: string | null; openUntil: string | null };

/**
 * How many items were **still open at the end of each bucket** (oldest →
 * newest) — for headlines that count what is currently outstanding
 * ("Missions", "Tasks").
 *
 * This replaces the old "cumulative count of the rows that are open *today*,
 * bucketed by when they were raised". That series was monotonically
 * non-decreasing by construction, so the trend badge on an open-work card
 * could never report a decrease no matter how much work got closed. A real
 * point-in-time open count goes down when work is finished, and its last
 * point is exactly the number of items open right now.
 */
export function openBacklogSeries(items: BacklogItem[], period: StatsPeriod): number[] {
  const rows = items
    .map((item) => ({
      created: toMs(item.createdAt),
      // Still open == open past every bucket boundary, including the future
      // one the newest bucket ends on.
      closed: item.openUntil === null ? Number.POSITIVE_INFINITY : toMs(item.openUntil),
    }))
    .filter((r) => Number.isFinite(r.created))
    // A closed item with an unparseable close instant would otherwise read as
    // "open forever" and desync the headline; treat it as closed on creation.
    .map((r) => ({ ...r, closed: Number.isNaN(r.closed) ? r.created : r.closed }));

  return periodBucketEnds(period).map((end) =>
    rows.reduce((n, r) => (r.created < end && r.closed >= end ? n + 1 : n), 0),
  );
}

/**
 * Percent change between the last two points of a series — deliberately
 * *exactly* the pair the sparkline's last two bars show, so the trend badge
 * can never describe a different window than the chart underneath it.
 *
 * Zero-denominator convention: a move away from 0 is reported as ±100% (a
 * true percentage change from zero is undefined, and NaN/Infinity must never
 * reach the DOM); 0 → 0 is 0%. `prev` is compared by magnitude so a net
 * balance moving −100 → −50 reads as +50%, not −50%.
 */
export function changePercent(series: number[]): number {
  const last = series[series.length - 1] ?? 0;
  const prev = series[series.length - 2] ?? 0;

  if (last === prev) return 0;
  if (prev === 0) return last > 0 ? 100 : -100;
  return Math.round(((last - prev) / Math.abs(prev)) * 100);
}

/** The value a series ends on — what a card's headline must display for the
 * headline, the last sparkline bar and the trend badge to agree. */
export function lastPoint(series: number[]): number {
  return series[series.length - 1] ?? 0;
}

/** Build all three grains from one already-fetched row set, so switching the
 * period costs no query and the toggle stays pure view state. */
export function buildPeriodSeries(build: (period: StatsPeriod) => number[]): PeriodSeries {
  return {
    daily: build('daily'),
    weekly: build('weekly'),
    monthly: build('monthly'),
  };
}

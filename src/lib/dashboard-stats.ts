// Shared helpers for the dashboard's stat cards and charts — turns a flat
// list of `created_at` timestamps into real monthly counts, rather than
// faking the trend badges/sparklines with static decorative data.
import { tashkentYmd, TASHKENT_TZ } from './time';

const monthFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TASHKENT_TZ });

/** Oldest-to-newest count of rows per calendar month, for the last `months`
 * months (including the current one). Months and timestamp bucketing are in
 * Asia/Tashkent — the staff's calendar, not the server's UTC one. */
export function monthlyBuckets(timestamps: (string | null)[], months: number): number[] {
  const { year: nowYear, month: nowMonth } = tashkentYmd(); // month is 1-12
  const buckets = Array.from({ length: months }, (_, i) => {
    let y = nowYear;
    let m = nowMonth - (months - 1 - i);
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    return { year: y, month: m, count: 0 };
  });

  for (const ts of timestamps) {
    if (!ts) continue;
    const [y, m] = monthFmt.format(new Date(ts)).split('-').map(Number);
    const bucket = buckets.find((b) => b.year === y && b.month === m);
    if (bucket) bucket.count += 1;
  }

  return buckets.map((b) => b.count);
}

/** Running total of rows as of the end of each of the last `months`
 * Asia/Tashkent months (oldest→newest). Unlike monthlyBuckets (new rows
 * per month) this is cumulative, so its last value == timestamps.length
 * and its MoM change tracks the same "total" a headline count shows. */
export function cumulativeMonthlyBuckets(timestamps: (string | null)[], months: number): number[] {
  const { year: nowYear, month: nowMonth } = tashkentYmd(); // month is 1-12
  const buckets = Array.from({ length: months }, (_, i) => {
    let y = nowYear;
    let m = nowMonth - (months - 1 - i);
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    return { key: y * 12 + m, count: 0 };
  });

  for (const ts of timestamps) {
    if (!ts) continue;
    const [y, m] = monthFmt.format(new Date(ts)).split('-').map(Number);
    const tsKey = y * 12 + m;
    for (const bucket of buckets) {
      if (tsKey <= bucket.key) bucket.count += 1;
    }
  }

  return buckets.map((b) => b.count);
}

/** Oldest-to-newest sum of money amounts per calendar month, for the last `months`
 * months (including the current one). */
export function monthlyAmountBuckets(
  entries: { amount: number; created_at: string | null }[],
  months: number,
): number[] {
  const { year: nowYear, month: nowMonth } = tashkentYmd();
  const buckets = Array.from({ length: months }, (_, i) => {
    let y = nowYear;
    let m = nowMonth - (months - 1 - i);
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    return { year: y, month: m, sum: 0 };
  });

  for (const entry of entries) {
    if (!entry.created_at) continue;
    const [y, m] = monthFmt.format(new Date(entry.created_at)).split('-').map(Number);
    const bucket = buckets.find((b) => b.year === y && b.month === m);
    if (bucket) bucket.sum += entry.amount;
  }

  return buckets.map((b) => Math.round(b.sum));
}

/** Running net total of money as of the end of each of the last `months`
 * Asia/Tashkent months (oldest→newest). The amount counterpart of
 * cumulativeMonthlyBuckets: unlike monthlyAmountBuckets (this month's net on
 * its own) its last value == the sum of every entry, so it ends on exactly
 * the number a running "net balance" headline shows. */
export function cumulativeMonthlyAmountBuckets(
  entries: { amount: number; created_at: string | null }[],
  months: number,
): number[] {
  const { year: nowYear, month: nowMonth } = tashkentYmd(); // month is 1-12
  const buckets = Array.from({ length: months }, (_, i) => {
    let y = nowYear;
    let m = nowMonth - (months - 1 - i);
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    return { key: y * 12 + m, sum: 0 };
  });

  for (const entry of entries) {
    if (!entry.created_at) continue;
    const [y, m] = monthFmt.format(new Date(entry.created_at)).split('-').map(Number);
    const tsKey = y * 12 + m;
    for (const bucket of buckets) {
      if (tsKey <= bucket.key) bucket.sum += entry.amount;
    }
  }

  return buckets.map((b) => Math.round(b.sum));
}

/** Percent change between the last two points of a series — deliberately
 * *exactly* the pair the sparkline's last two bars show, so the trend badge
 * can never describe a different window than the chart underneath it.
 *
 * There is no "the month just started, so the current bucket is still 0"
 * fallback any more: every series a stat card renders is a running total
 * (cumulativeMonthly*Buckets), which does not reset on the 1st, and a
 * fallback silently re-pointed the badge at the *previous* month pair while
 * the sparkline kept showing the current one.
 *
 * `prev` is compared by magnitude so a net balance moving -100 → -50 reads
 * as +50%, not -50%. */
export function momChangePercent(series: number[]): number {
  const last = series[series.length - 1] ?? 0;
  const prev = series[series.length - 2] ?? 0;

  if (prev === 0) {
    if (last === 0) return 0;
    return last > 0 ? 100 : -100;
  }
  return Math.round(((last - prev) / Math.abs(prev)) * 100);
}

/** The value a series ends on — what a card's headline must display for the
 * headline, the last sparkline bar and the trend badge to agree. */
export function lastPoint(series: number[]): number {
  return series[series.length - 1] ?? 0;
}

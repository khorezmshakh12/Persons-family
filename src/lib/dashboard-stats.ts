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

/** Percent change between the last two buckets (this month vs. last month).
 * If the current month has 0 (e.g. month just started and entries haven't arrived yet),
 * we check the previous month's trend rather than falsely reporting -100%. */
export function momChangePercent(buckets: number[]): number {
  const last = buckets[buckets.length - 1] ?? 0;
  const prev = buckets[buckets.length - 2] ?? 0;
  const prevPrev = buckets[buckets.length - 3] ?? 0;

  if (last > 0) {
    if (prev === 0) return 100;
    return Math.round(((last - prev) / prev) * 100);
  }

  // Current month has 0 so far
  if (prev > 0) {
    if (prevPrev > 0) {
      return Math.round(((prev - prevPrev) / prevPrev) * 100);
    }
    return 0;
  }

  return 0;
}

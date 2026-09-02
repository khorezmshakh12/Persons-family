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

/** Percent change between the last two buckets (this month vs. last month). */
export function momChangePercent(buckets: number[]): number {
  const last = buckets[buckets.length - 1] ?? 0;
  const prev = buckets[buckets.length - 2] ?? 0;
  if (prev === 0) return last > 0 ? 100 : 0;
  return Math.round(((last - prev) / prev) * 100);
}

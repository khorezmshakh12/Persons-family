// Shared helpers for the dashboard's stat cards and charts — turns a flat
// list of `created_at` timestamps into real monthly counts, rather than
// faking the trend badges/sparklines with static decorative data.

/** Oldest-to-newest count of rows per calendar month, for the last `months`
 * months (including the current one). */
export function monthlyBuckets(timestamps: (string | null)[], months: number): number[] {
  const now = new Date();
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(), count: 0 };
  });

  for (const ts of timestamps) {
    if (!ts) continue;
    const d = new Date(ts);
    const bucket = buckets.find((b) => b.year === d.getFullYear() && b.month === d.getMonth());
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

/** Whole days between today and a Y-M-D deadline, UTC-anchored so it's
 * stable regardless of the caller's local time-of-day. Negative once the
 * deadline has passed. */
export function daysUntil(deadlineDate: string): number {
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const deadlineUtc = new Date(`${deadlineDate}T00:00:00Z`).getTime();
  return Math.round((deadlineUtc - todayUtc) / (24 * 60 * 60 * 1000));
}

/** Short Term vs Long Term is never stored — it's purely a function of how
 * much time is left until the deadline, recomputed every time the page
 * renders. A mission created as Long Term (up to a year out) automatically
 * reads as Short Term once it crosses the 30-day mark. */
export function isShortTerm(deadlineDate: string): boolean {
  return daysUntil(deadlineDate) < 30;
}

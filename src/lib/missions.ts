/** Whole days between today and a Y-M-D deadline. "Today" is the Asia/
 * Tashkent calendar day (the staff's day), not the server's UTC one, so a
 * mission due today doesn't read as "1 day left" for the first ~5 hours.
 * Negative once the deadline has passed. */
export function daysUntil(deadlineDate: string): number {
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const todayUtc = new Date(`${todayKey}T00:00:00Z`).getTime();
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

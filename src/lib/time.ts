/**
 * Business time is Asia/Tashkent — the whole staff is there, and Cloud Run's
 * clock is UTC. Anything that derives a calendar day, month, or "today" from
 * `new Date()` on the server is a bug during the first ~5 hours of a Tashkent
 * day (a day, or on the 1st a whole month, behind).
 *
 * Use these helpers instead of `new Date().getMonth()` / `getFullYear()` /
 * `getDate()` / `getDay()` — the eslint config bans those bare calls in
 * `src/**` for exactly this reason.
 *
 * Uzbekistan has no DST, so the offset is a constant +5.
 */
export const TASHKENT_TZ = 'Asia/Tashkent';
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TASHKENT_TZ });

/** 'YYYY-MM-DD' for the given instant (default: now) in Asia/Tashkent. */
export function tashkentDayKey(at: Date = new Date()): string {
  return dayKeyFmt.format(at);
}

/** { year, month (1-12), day } in Asia/Tashkent for the given instant. */
export function tashkentYmd(at: Date = new Date()): { year: number; month: number; day: number } {
  const [year, month, day] = dayKeyFmt.format(at).split('-').map(Number);
  return { year, month, day };
}

/** Day of week in Asia/Tashkent: 0 = Sunday .. 6 = Saturday. */
export function tashkentDayOfWeek(at: Date = new Date()): number {
  return new Date(`${tashkentDayKey(at)}T00:00:00Z`).getUTCDay();
}

/** Midnight (00:00 Tashkent) of a 'YYYY-MM-DD' key, as a UTC instant. */
export function tashkentMidnight(dayKey: string): Date {
  return new Date(new Date(`${dayKey}T00:00:00Z`).getTime() - TASHKENT_OFFSET_MS);
}

/** First day of the current Tashkent month as 'YYYY-MM-01'. */
export function startOfTashkentMonthKey(at: Date = new Date()): string {
  const { year, month } = tashkentYmd(at);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** 'YYYY-MM' for the current Tashkent month (or any instant). */
export function tashkentMonthKey(at: Date = new Date()): string {
  const { year, month } = tashkentYmd(at);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** First day of the previous Tashkent month as 'YYYY-MM-01'. */
export function startOfPreviousTashkentMonthKey(at: Date = new Date()): string {
  const { year, month } = tashkentYmd(at);
  const py = month === 1 ? year - 1 : year;
  const pm = month === 1 ? 12 : month - 1;
  return `${py}-${String(pm).padStart(2, '0')}-01`;
}

/** Add `days` to a 'YYYY-MM-DD' key, returning a new key. */
export function addDaysToKey(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The calendar day-of-month (Tashkent) an instant falls on. */
export function tashkentDayOfMonth(at: Date): number {
  return tashkentYmd(at).day;
}

/** Current calendar year+month in Asia/Tashkent — the whole staff is there
 * and Cloud Run's clock is UTC, so during the first ~5 hours of the 1st a
 * UTC-derived month would still read as the previous one. Mirrors the
 * Intl-based approach in src/lib/actions/missions.ts. */
function tashkentYearMonth(): { year: number; month: number } {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

/** Always "this month," as a plain `YYYY-MM-01` date string — never a
 * client-supplied value, so the (user_id, month) unique constraint on
 * self_development means "once per calendar month, for real." Shared
 * between the submit action and the page's "already submitted?" check. */
export function firstOfCurrentMonth(): string {
  const { year, month } = tashkentYearMonth();
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** The last fully-completed calendar month — used for the "last month's
 * results across the team" chart, so it always reflects a month that's
 * actually over rather than the still-in-progress current one. */
export function firstOfPreviousMonth(): string {
  const { year, month } = tashkentYearMonth();
  const py = month === 1 ? year - 1 : year;
  const pm = month === 1 ? 12 : month - 1;
  return `${py}-${String(pm).padStart(2, '0')}-01`;
}

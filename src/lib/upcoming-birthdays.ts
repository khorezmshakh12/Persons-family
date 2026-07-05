/** "Today" for the business, not the server's own timezone — the whole staff is in Tashkent. */
export function tashkentTodayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
}

/**
 * Matches on month + day only (year-independent). Dates are parsed as UTC
 * midnight throughout so a `date` column's plain "YYYY-MM-DD" string can't
 * shift by a day depending on the server's local timezone offset.
 */
export function getUpcomingBirthdays<T extends { date_of_birth: string }>(
  profiles: T[],
  daysAhead = 2,
): T[] {
  const target = new Date(`${tashkentTodayKey()}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + daysAhead);
  const targetMonth = target.getUTCMonth();
  const targetDay = target.getUTCDate();

  return profiles.filter((p) => {
    const dob = new Date(`${p.date_of_birth}T00:00:00Z`);
    return dob.getUTCMonth() === targetMonth && dob.getUTCDate() === targetDay;
  });
}

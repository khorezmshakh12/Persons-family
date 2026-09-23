import { tashkentMidnight, tashkentYmd } from '@/lib/time';

export type TeacherLevel = 'C' | 'C+' | 'C++' | 'B' | 'B+' | 'B++' | 'A' | 'A+' | 'A++';

export const TEACHER_LEVELS: TeacherLevel[] = ['C', 'C+', 'C++', 'B', 'B+', 'B++', 'A', 'A+', 'A++'];

const REVIEW_DUE_MONTHS = 3;

/** True once a level hasn't been touched in 3+ months — surfaced to the CEO
 * as a "Review due" nudge on the Staff table.
 *
 * The threshold is "3 calendar months ago" in Asia/Tashkent, not the
 * server's own UTC clock: a bare `new Date(); threshold.setMonth(...)`
 * reads/sets the month in the server's local (UTC) calendar, which runs up
 * to 5 hours behind Tashkent's — during that window on the 1st of a month
 * this would compute last month's date, not this month's, quietly stretching
 * the 3-month window by up to a full month for anyone who checks then. */
export function isLevelReviewDue(levelUpdatedAt: string): boolean {
  const { year, month, day } = tashkentYmd();
  let thresholdMonth = month - REVIEW_DUE_MONTHS;
  let thresholdYear = year;
  while (thresholdMonth <= 0) {
    thresholdMonth += 12;
    thresholdYear -= 1;
  }
  const thresholdKey = `${thresholdYear}-${String(thresholdMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return new Date(levelUpdatedAt) < tashkentMidnight(thresholdKey);
}

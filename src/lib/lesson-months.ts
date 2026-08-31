import 'server-only';
import { tashkentTodayKey } from '@/lib/upcoming-birthdays';

/**
 * Month bucketing for lesson plans, in Asia/Tashkent — never the server's
 * own (UTC) clock. `course_lessons.lesson_date` comes back from postgres-js
 * as the raw 'YYYY-MM-DD' wire string (see the `types.date` identity parser
 * in db/client.ts), and both that and a 'YYYY-MM' month key are
 * zero-padded/fixed-width, so plain string comparison is already correct
 * calendar ordering — no Date object (and no timezone shift) involved.
 */

/** 'YYYY-MM' for a 'YYYY-MM-DD' date key. */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** The month the business is currently in, 'YYYY-MM'. */
export function currentMonthKey(): string {
  return monthKeyOf(tashkentTodayKey());
}

/**
 * True when the lesson falls before the first day of the current Tashkent
 * month — i.e. its month is closed and the row is frozen for everyone, the
 * CEO included. A lesson with no date yet is never "past": it has no month
 * to be locked in, and setting that date is the one write it still needs.
 */
export function isPastMonth(lessonDate: string | null | undefined): boolean {
  if (!lessonDate) return false;
  return monthKeyOf(lessonDate) < currentMonthKey();
}

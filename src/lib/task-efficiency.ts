import 'server-only';
import { tashkentTodayKey } from '@/lib/upcoming-birthdays';

/**
 * A task counts toward a given week if its `deadline` falls inside that
 * week's Monday 00:00 .. Sunday 23:59:59.999 window, in Asia/Tashkent (the
 * whole staff is there; Cloud Run's own clock is UTC and must never be the
 * reference). "On time" = the task reached `status = 'done'` with
 * `completed_at <= deadline`. Everything else that was due in the window is
 * either done-late or not-done.
 *
 * efficiency % = round(doneOnTime / totalDue * 100); a week with nothing
 * due is reported as 100 (nothing to miss), never NaN.
 */

export type WeekWindow = {
  /** 'YYYY-MM-DD' Monday, Asia/Tashkent */
  startKey: string;
  /** 'YYYY-MM-DD' Sunday, Asia/Tashkent */
  endKey: string;
  /** inclusive lower bound as an instant */
  startsAt: Date;
  /** exclusive upper bound (next Monday 00:00 Tashkent) as an instant */
  endsBefore: Date;
};

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, no DST in Uzbekistan

/** Midnight (Tashkent) of the given 'YYYY-MM-DD' key, as a UTC instant. */
function tashkentMidnight(dateKey: string): Date {
  return new Date(new Date(`${dateKey}T00:00:00Z`).getTime() - TASHKENT_OFFSET_MS);
}

function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The completed week that ended most recently before `reference` (default:
 * now). Run on Monday, this returns last Mon..Sun — exactly the week the
 * weekly bot should score.
 */
export function previousWeekWindow(reference: Date = new Date()): WeekWindow {
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(reference);
  // 0 = Sunday .. 6 = Saturday, for the Tashkent calendar day.
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = addDaysKey(todayKey, -daysSinceMonday);
  const startKey = addDaysKey(thisMonday, -7);
  const endKey = addDaysKey(thisMonday, -1);
  return {
    startKey,
    endKey,
    startsAt: tashkentMidnight(startKey),
    endsBefore: tashkentMidnight(thisMonday),
  };
}

/** The week currently in progress (this Mon..Sun, Asia/Tashkent). */
export function currentWeekWindow(reference: Date = new Date()): WeekWindow {
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(reference);
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const startKey = addDaysKey(todayKey, -daysSinceMonday);
  const endKey = addDaysKey(startKey, 6);
  return {
    startKey,
    endKey,
    startsAt: tashkentMidnight(startKey),
    endsBefore: tashkentMidnight(addDaysKey(startKey, 7)),
  };
}

export type TaskLike = {
  deadline: string | Date;
  status: string;
  completed_at: string | Date | null;
};

export type EfficiencyStats = {
  totalDue: number;
  doneOnTime: number;
  doneLate: number;
  notDone: number;
  efficiencyPct: number;
};

/** Score an already-fetched list of a single person's tasks against a week. */
export function efficiencyForWeek(tasks: TaskLike[], week: WeekWindow): EfficiencyStats {
  let totalDue = 0;
  let doneOnTime = 0;
  let doneLate = 0;
  let notDone = 0;

  for (const t of tasks) {
    const deadline = new Date(t.deadline);
    if (deadline < week.startsAt || deadline >= week.endsBefore) continue;
    totalDue += 1;
    if (t.status === 'done' && t.completed_at) {
      if (new Date(t.completed_at) <= deadline) doneOnTime += 1;
      else doneLate += 1;
    } else {
      notDone += 1;
    }
  }

  const efficiencyPct = totalDue === 0 ? 100 : Math.round((doneOnTime / totalDue) * 100);
  return { totalDue, doneOnTime, doneLate, notDone, efficiencyPct };
}

/** Efficiency of a calendar month's worth of already-fetched tasks (used by
 * the monthly task archive, spec #5). `monthKey` is 'YYYY-MM'. */
export function efficiencyForMonth(tasks: TaskLike[], monthKey: string): EfficiencyStats {
  const startsAt = tashkentMidnight(`${monthKey}-01`);
  const [y, m] = monthKey.split('-').map(Number);
  const nextMonthKey = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const endsBefore = tashkentMidnight(`${nextMonthKey}-01`);
  return efficiencyForWeek(tasks, { startKey: `${monthKey}-01`, endKey: '', startsAt, endsBefore });
}

/** Threshold below which the weekly bot sends the employee an automatic warning. */
export const WEEKLY_EFFICIENCY_WARN_THRESHOLD = 80;

export { tashkentTodayKey };

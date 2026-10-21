/**
 * Checklist + Maqsadlar statistics boards (owner, 2026-10-21) — the old Task
 * Tracker's "Quiet Progress" view: a month matrix of ticks, a line that moves
 * as boxes are ticked, weekly bars, a today ring and an analysis column.
 *
 * Client-safe: the server sends the raw month (items, ticks, goals) and the
 * board computes every number here, so a tick re-draws the line at once.
 */

export type BoardDay = { key: string; n: number; w: string; off: boolean };
export type GoalScope = 'day' | 'week' | 'month';
export type BoardGoal = {
  id: string;
  scope: GoalScope;
  title: string;
  periodKey: string;
  /** First day the goal was open (its period start, or the day it was added). */
  startDay: string;
  /** Last day of its period — after it an open goal is late (and carried). */
  dueDay: string;
  doneDay: string | null;
};
export type ProgressBoardData = {
  today: string;
  /** Oldest day a checklist box may still be ticked (yesterday). */
  editableFrom: string;
  monthTitle: string;
  days: BoardDay[];
  /** This Mon–Sun week (may reach into the previous month). */
  week: BoardDay[];
  items: { id: string; title: string }[];
  ticks: string[];
  weekly: { done: number; total: number };
  monthly: { done: number; total: number };
  goals: BoardGoal[];
  periodKeys: Record<GoalScope, string>;
};

export const W_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

export const tickKey = (id: string, day: string) => `${id}|${day}`;
export const dayLabel = (key: string) => `${Number(key.slice(8, 10))}-${MONTHS[Number(key.slice(5, 7)) - 1]}`;

const pctOf = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

/** A working day that has already started. */
export const isWorkDay = (d: BoardDay, today: string) => !d.off && d.key <= today;

export function checklistDay(items: { id: string }[], ticks: ReadonlySet<string>, day: string) {
  const done = items.reduce((t, i) => t + (ticks.has(tickKey(i.id, day)) ? 1 : 0), 0);
  return { done, total: items.length, pct: pctOf(done, items.length) };
}

/** Consecutive fully-done working days back from today. An unfinished today
 * neither breaks nor extends it; off days are skipped. */
export function checklistStreak(days: BoardDay[], today: string, full: (key: string) => boolean): number {
  let streak = 0;
  for (const d of [...days].reverse()) {
    if (d.key > today || d.off) continue;
    if (full(d.key)) streak++;
    else if (d.key !== today) break;
  }
  return streak;
}

export type GoalCell = 'none' | 'done' | 'open' | 'late' | 'future';

/** What a goal was on one day: added later, open, overdue, done that day. */
export function goalCell(g: BoardGoal, day: string, today: string): GoalCell {
  if (day < g.startDay) return 'none';
  if (g.doneDay) return day === g.doneDay ? 'done' : day > g.doneDay ? 'none' : day > g.dueDay ? 'late' : 'open';
  if (day > today) return 'future';
  return day > g.dueDay ? 'late' : 'open';
}

/** The day goals set for one day: how many were done that same day, and —
 * once the day is over — how many were left behind ("qolib ketdi"). A goal
 * finished later still counts as done, but not as done that day. */
export function dayGoals(goals: BoardGoal[], day: string, today: string) {
  const list = goals.filter((g) => g.scope === 'day' && g.dueDay === day);
  const done = list.filter((g) => g.doneDay).length;
  const onTime = list.filter((g) => g.doneDay && g.doneDay <= day).length;
  return { done, onTime, left: day < today ? list.length - onTime : 0, total: list.length, pct: pctOf(onTime, list.length) };
}

/** Goals whose period ended unfinished — still open, or done late — newest
 * day first: the "qolib ketgan maqsadlar" list. */
export function leftBehind(goals: BoardGoal[], today: string): { day: string; goals: BoardGoal[] }[] {
  const by = new Map<string, BoardGoal[]>();
  for (const g of goals) {
    if (g.dueDay >= today || (g.doneDay && g.doneDay <= g.dueDay)) continue;
    by.set(g.dueDay, [...(by.get(g.dueDay) ?? []), g]);
  }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => ({ day, goals: list }));
}

/** Goals that need doing today: today's own, plus every earlier one still open. */
export function openToday(goals: BoardGoal[], scope: GoalScope, periodKey: string): BoardGoal[] {
  return goals.filter((g) => g.scope === scope && (g.periodKey === periodKey || (!g.doneDay && g.periodKey < periodKey)));
}

export function goalSummary(goals: BoardGoal[], scope: GoalScope) {
  const list = goals.filter((g) => g.scope === scope);
  const done = list.filter((g) => g.doneDay);
  return {
    total: list.length,
    done: done.length,
    onTime: done.filter((g) => g.doneDay! <= g.dueDay).length,
    late: done.filter((g) => g.doneDay! > g.dueDay).length,
    pct: pctOf(done.length, list.length),
  };
}

/** Smooth line through points (Catmull-Rom as cubic Béziers). */
export function spline(pts: [number, number][]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const f = (n: number) => n.toFixed(1);
  let s = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    s += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return s;
}

// Persons Perforce — pure planning / quality maths over real Strategy data
// (strategy_tasks with done_at, issues, pf_test_cases). No I/O; unit-tested
// in tests/perforce.test.ts. Dates are Tashkent 'YYYY-MM-DD' day keys.

import { addDays, daysBetween } from './strategy';

/** Sprint 1 starts Monday 5 Jan 2026; sprints are 14 days. */
export const SPRINT_ANCHOR = '2026-01-05';
export const SPRINT_DAYS = 14;

export function sprintByNo(no: number) {
  const from = addDays(SPRINT_ANCHOR, (no - 1) * SPRINT_DAYS);
  return { no, from, to: addDays(from, SPRINT_DAYS - 1) };
}
export function sprintOf(day: string) {
  return sprintByNo(Math.floor(daysBetween(SPRINT_ANCHOR, day) / SPRINT_DAYS) + 1);
}

export type PTask = { id: string; start_date: string; end_date: string; status: string; done: string | null; created: string; assignee_id: string | null; space_id: string };

const inSprint = (t: Pick<PTask, 'start_date' | 'end_date'>, s: { from: string; to: string }) => t.start_date <= s.to && t.end_date >= s.from;

/** Planned (scheduled into the sprint) vs done (done_at inside it) for the
 * `n` sprints ending with sprint `lastNo`. */
export function velocity(tasks: PTask[], lastNo: number, n = 6) {
  return Array.from({ length: Math.min(n, lastNo) }, (_, i) => {
    const s = sprintByNo(lastNo - Math.min(n, lastNo) + 1 + i);
    return {
      ...s,
      planned: tasks.filter((t) => inSprint(t, s)).length,
      done: tasks.filter((t) => t.done && t.done >= s.from && t.done <= s.to).length,
    };
  });
}

/** Sprints (and finish date) to burn `remaining` tasks at the min / avg / max
 * velocity of the given completed sprints. null when velocity is 0. */
export function velocityForecast(done: number[], remaining: number, nextFrom: string) {
  const v = done.length ? done : [0];
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  const mk = (rate: number) => {
    if (rate <= 0) return null;
    const sprints = Math.ceil(remaining / rate);
    return { rate: Math.round(rate * 10) / 10, sprints, finish: addDays(nextFrom, sprints * SPRINT_DAYS - 1) };
  };
  return { avg, pessimistic: mk(Math.min(...v)), average: mk(avg), optimistic: mk(Math.max(...v)) };
}

/** Remaining-work series for the sprint days with a straight-line
 * projection after `today` at the burn rate observed so far. */
export function burndown(scope: PTask[], days: string[], today: string) {
  const total = scope.length;
  const actual = days.map((d) => (d > today ? NaN : scope.filter((t) => !(t.done && t.done <= d)).length));
  const ideal = days.map((_, i) => Math.round(((total * (days.length - 1 - i)) / Math.max(1, days.length - 1)) * 10) / 10);
  const known = actual.filter((v) => !Number.isNaN(v));
  const n = known.length;
  const rate = n > 1 ? (known[0] - known[n - 1]) / (n - 1) : 0;
  const last = n ? known[n - 1] : total;
  const forecast = days.map((_, i) => (i < n - 1 ? NaN : Math.max(0, Math.round((last - rate * (i - n + 1)) * 10) / 10)));
  const idealNow = n ? ideal[n - 1] : total;
  return { total, actual, ideal, forecast, rate, onTrack: last <= idealNow, remaining: last };
}

/** Per-person load inside the sprint; `cap` = tasks one person can carry
 * (team's average sprint velocity per active assignee, at least 3). */
export function workload(scope: PTask[], avgVelocity: number) {
  const by = new Map<string, { total: number; done: number }>();
  for (const t of scope) {
    if (!t.assignee_id) continue;
    const r = by.get(t.assignee_id) ?? { total: 0, done: 0 };
    r.total++;
    if (t.status === 'done') r.done++;
    by.set(t.assignee_id, r);
  }
  const cap = Math.max(3, Math.ceil(avgVelocity / Math.max(1, by.size)));
  return {
    cap,
    rows: [...by.entries()].map(([id, r]) => ({ id, ...r, over: r.total - r.done > cap })).sort((a, b) => b.total - a.total),
  };
}

/** Portfolio progress weighted by each project's planned budget (falls back
 * to task count when no budget is planned). */
export function weightedProgress(rows: { progress: number; tasks: number; budget: number }[]) {
  const useBudget = rows.some((r) => r.budget > 0);
  const w = (r: (typeof rows)[number]) => (useBudget ? r.budget : r.tasks);
  const tw = rows.reduce((a, r) => a + w(r), 0);
  return tw > 0 ? rows.reduce((a, r) => a + r.progress * w(r), 0) / tw : 0;
}

/* ---------------------------------------------------------------- ALM */

export type TestResult = 'pass' | 'fail' | 'blocked' | 'none';
export type TestCase = { id: string; space_id: string; stask_id: string | null; title: string; result: TestResult; issue_id: string | null };

/** Traceability per requirement (Strategy task): tests, passes, fails, open
 * linked defects and a status; plus coverage and a 0–100 quality index
 * (70% pass rate + 30% requirement coverage). */
export function traceability(reqs: { id: string }[], tests: TestCase[], openIssues: Set<string>) {
  const rows = reqs.map((r) => {
    const ts = tests.filter((t) => t.stask_id === r.id);
    const pass = ts.filter((t) => t.result === 'pass').length;
    const fail = ts.filter((t) => t.result === 'fail').length;
    const bugs = ts.filter((t) => t.issue_id && openIssues.has(t.issue_id)).length;
    const st = !ts.length ? 'gap' : fail || bugs ? 'bad' : pass === ts.length ? 'ok' : 'warn';
    return { id: r.id, tests: ts, pass, fail, bugs, st: st as 'gap' | 'bad' | 'ok' | 'warn' };
  });
  const covered = rows.filter((r) => r.tests.length).length;
  const coverage = rows.length ? covered / rows.length : 0;
  const passRate = tests.length ? tests.filter((t) => t.result === 'pass').length / tests.length : 0;
  return { rows, coverage, passRate, quality: Math.round(passRate * 70 + coverage * 30) };
}

/** Release readiness for a milestone's project. */
export function readiness(tasks: PTask[], tests: TestCase[], openIssues: Set<string>) {
  const done = tasks.filter((t) => t.status === 'done').length;
  const pass = tests.filter((t) => t.result === 'pass').length;
  const bugs = tests.filter((t) => t.issue_id && openIssues.has(t.issue_id)).length;
  const state = bugs ? 'blocked' : tasks.length && done / tasks.length > 0.6 && (!tests.length || pass === tests.length) ? 'ready' : 'progress';
  return { done, total: tasks.length, pass, tests: tests.length, bugs, state: state as 'blocked' | 'ready' | 'progress' };
}

/** Cumulative flow: per day, tasks created so far split into done / open. */
export function cumulativeFlow(tasks: PTask[], days: string[]) {
  return days.map((d) => {
    const created = tasks.filter((t) => t.created <= d).length;
    const done = tasks.filter((t) => t.done && t.done <= d).length;
    return { d, done, open: Math.max(0, created - done) };
  });
}

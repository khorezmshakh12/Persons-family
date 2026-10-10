/** Strategy v2 planning maths — task dependencies, critical path, cascade
 * shifts, check-in weeks and quarters. Pure; shared by client and server. */

import { addDays, daysBetween } from './strategy';

export type Dep = { task_id: string; depends_on: string };
type Span = { id: string; start_date: string; end_date: string };

/** Would adding `taskId → dependsOn` close a loop? */
export function createsCycle(deps: Dep[], taskId: string, dependsOn: string): boolean {
  if (taskId === dependsOn) return true;
  // Walk forward from taskId's dependants… simpler: from dependsOn, follow its
  // own prerequisites; reaching taskId means taskId is already upstream.
  const pre = new Map<string, string[]>();
  for (const d of deps) pre.set(d.task_id, [...(pre.get(d.task_id) ?? []), d.depends_on]);
  const seen = new Set<string>();
  const stack = [dependsOn];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(pre.get(cur) ?? []));
  }
  return false;
}

/** Pairs where a task starts before the one it waits for has finished. */
export function depViolations(tasks: Span[], deps: Dep[]): Dep[] {
  const by = new Map(tasks.map((t) => [t.id, t]));
  return deps.filter((d) => {
    const t = by.get(d.task_id);
    const p = by.get(d.depends_on);
    return !!t && !!p && t.start_date <= p.end_date;
  });
}

/**
 * Moving/resizing `changed` to the given dates: every task downstream that
 * would now start on or before its prerequisite's end is pushed to the next
 * day, keeping its length. Returns only the tasks that move (not `changed`).
 */
export function cascadeShift(tasks: Span[], deps: Dep[], changed: Span): Span[] {
  const by = new Map(tasks.map((t) => [t.id, { ...t }]));
  by.set(changed.id, { ...changed });
  const next = new Map<string, string[]>();
  for (const d of deps) next.set(d.depends_on, [...(next.get(d.depends_on) ?? []), d.task_id]);
  const moved = new Map<string, Span>();
  const queue = [changed.id];
  let guard = 0;
  while (queue.length && guard++ < 2000) {
    const id = queue.shift()!;
    const p = by.get(id);
    if (!p) continue;
    for (const sid of next.get(id) ?? []) {
      const s = by.get(sid);
      if (!s || s.start_date > p.end_date) continue;
      const len = daysBetween(s.start_date, s.end_date);
      const start = addDays(p.end_date, 1);
      const shifted = { id: s.id, start_date: start, end_date: addDays(start, len) };
      by.set(sid, shifted);
      moved.set(sid, shifted);
      queue.push(sid);
    }
  }
  return [...moved.values()];
}

/**
 * The chain that decides the finish date: start from the task that ends
 * last and walk back through prerequisites that end right before (≤ 1 day
 * of slack) the dependant starts.
 */
export function criticalPath(tasks: Span[], deps: Dep[]): Set<string> {
  const out = new Set<string>();
  if (!tasks.length || !deps.length) return out;
  const by = new Map(tasks.map((t) => [t.id, t]));
  const pre = new Map<string, string[]>();
  for (const d of deps) pre.set(d.task_id, [...(pre.get(d.task_id) ?? []), d.depends_on]);
  const linked = new Set(deps.flatMap((d) => [d.task_id, d.depends_on]));
  const last = tasks.filter((t) => linked.has(t.id)).sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
  if (!last) return out;
  const stack = [last.id];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const t = by.get(id)!;
    for (const pid of pre.get(id) ?? []) {
      const p = by.get(pid);
      if (p && daysBetween(p.end_date, t.start_date) <= 1) stack.push(pid);
    }
  }
  return out.size > 1 ? out : new Set();
}

/** Monday (YYYY-MM-DD) of the week a day key falls in. */
export function weekOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/** "2026-Q4" for a day key. */
export function quarterOf(day: string): string {
  return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
}

/** First and last day of a quarter key. */
export function quarterRange(q: string): [string, string] {
  const y = Number(q.slice(0, 4));
  const n = Number(q.slice(-1));
  const start = `${y}-${String((n - 1) * 3 + 1).padStart(2, '0')}-01`;
  const endMonth = n * 3;
  const end = new Date(Date.UTC(y, endMonth, 0)).toISOString().slice(0, 10);
  return [start, end];
}

/** Share of a quarter already gone on `day`, 0–100. */
export function quarterElapsed(q: string, day: string): number {
  const [s, e] = quarterRange(q);
  const total = daysBetween(s, e) + 1;
  return Math.max(0, Math.min(100, Math.round(((daysBetween(s, day) + 1) / total) * 100)));
}

export const CONFIDENCE = {
  on: { n: 'Rejada', c: 'var(--au-ok)' },
  risk: { n: 'Xavf bor', c: 'var(--au-accent)' },
  off: { n: 'Orqada', c: 'var(--au-bad)' },
} as const;
export type Confidence = keyof typeof CONFIDENCE;

export const JEV_VERDICT = {
  likely: { n: 'Erishiladi', c: 'var(--au-ok)' },
  risk: { n: 'Xavfli', c: 'var(--au-accent)' },
  unlikely: { n: 'Erishilmaydi', c: 'var(--au-bad)' },
} as const;
export type JevVerdict = keyof typeof JEV_VERDICT;

/** Google-style OKR grade colour: 0.7+ green, 0.4–0.69 amber, below red. */
export function scoreTone(score: number) {
  return score >= 0.7 ? 'var(--au-ok)' : score >= 0.4 ? 'var(--au-accent)' : 'var(--au-bad)';
}

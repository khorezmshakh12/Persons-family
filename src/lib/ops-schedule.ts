/**
 * Operation HQ scheduling maths — pure, shared by the server actions (which
 * refuse invalid moves) and the timeline (which previews them while you
 * drag). Times are Tashkent wall-clock 'HH:MM'; a group meets on one cohort
 * (odd = Mon/Wed/Fri, even = Tue/Thu/Sat) at one time for `duration` minutes.
 */
export type Cohort = 'odd' | 'even';
export const DEFAULT_DURATION = 90;

export type SchedGroup = {
  id: string;
  name: string;
  course: string;
  cohort: Cohort | null;
  time: string;
  room: string;
  teacher_id: string | null;
  teacher: string;
  duration: number;
  enrolled: number | null;
};

export type Placement = { room: string; time: string; cohort: Cohort; duration: number };

/** A teacher's working window on a cohort; none recorded = always available. */
export type Availability = { teacher_id: string; cohort: Cohort; start: string; end: string };

export type IssueKind = 'room' | 'teacher' | 'capacity' | 'availability';
export type Issue = { kind: IssueKind; groupId: string; other?: string; text: string };

export const toMin = (t: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
export const fmtMin = (n: number): string => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

export const overlaps = (aStart: string, aDur: number, bStart: string, bDur: number): boolean => {
  const a = toMin(aStart);
  const b = toMin(bStart);
  return Number.isFinite(a) && Number.isFinite(b) && a < b + bDur && b < a + aDur;
};

export const isScheduled = (g: SchedGroup): g is SchedGroup & { cohort: Cohort } => !!(g.cohort && g.time && g.room);

/** Everything wrong with putting `g` at `p`, given the rest of the schedule. */
export function issuesFor(
  g: SchedGroup,
  p: Placement,
  all: SchedGroup[],
  capOf: (room: string) => number,
  availability: Availability[] = [],
): Issue[] {
  const out: Issue[] = [];
  for (const o of all) {
    if (o.id === g.id || !isScheduled(o) || o.cohort !== p.cohort) continue;
    if (!overlaps(p.time, p.duration, o.time, o.duration)) continue;
    if (o.room === p.room) out.push({ kind: 'room', groupId: g.id, other: o.id, text: `${p.room} xonasida ${o.name} (${o.time})` });
    if (g.teacher_id && o.teacher_id === g.teacher_id)
      out.push({ kind: 'teacher', groupId: g.id, other: o.id, text: `${g.teacher} shu vaqtda ${o.name} guruhida (${o.room})` });
  }
  const cap = capOf(p.room);
  if (g.enrolled != null && cap > 0 && g.enrolled > cap)
    out.push({ kind: 'capacity', groupId: g.id, text: `${g.enrolled} o‘quvchi, ${p.room} sig‘imi ${cap}` });
  if (g.teacher_id) {
    const windows = availability.filter((a) => a.teacher_id === g.teacher_id && a.cohort === p.cohort);
    const s = toMin(p.time);
    if (windows.length && !windows.some((w) => s >= toMin(w.start) && s + p.duration <= toMin(w.end)))
      out.push({ kind: 'availability', groupId: g.id, text: `${g.teacher} ${p.time} da ishlamaydi` });
  }
  return out;
}

/** Every issue in the current schedule, each pair reported once. */
export function scheduleIssues(groups: SchedGroup[], capOf: (room: string) => number, availability: Availability[] = []): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const g of groups) {
    if (!isScheduled(g)) continue;
    for (const i of issuesFor(g, { room: g.room, time: g.time, cohort: g.cohort, duration: g.duration }, groups, capOf, availability)) {
      const key = i.other ? [i.kind, ...[i.groupId, i.other].sort()].join('|') : `${i.kind}|${i.groupId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(i);
    }
  }
  return out;
}

/** Blocking issues refuse a move; capacity and availability only warn. */
export const isBlocking = (i: Issue) => i.kind === 'room' || i.kind === 'teacher';

/* ------------------------------------------------------------ demand vs supply */

export type CourseBalance = { course: string; demand: number; groups: number; freeSeats: number; gap: number };

/**
 * Per course: monthly demand (arrivals over the window ÷ months) against
 * free seats in its existing groups. A positive gap means more people want
 * the course than there is room for.
 */
export function courseBalance(
  arrivals: { course: string }[],
  months: number,
  groups: SchedGroup[],
  capOf: (room: string) => number,
): CourseBalance[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const names = new Map<string, string>();
  for (const a of arrivals) if (a.course.trim()) names.set(norm(a.course), names.get(norm(a.course)) ?? a.course.trim());
  for (const g of groups) if (g.course.trim()) names.set(norm(g.course), names.get(norm(g.course)) ?? g.course.trim());
  return [...names.entries()]
    .map(([key, course]) => {
      const demand = Math.round(arrivals.filter((a) => norm(a.course) === key).length / Math.max(1, months));
      const gs = groups.filter((g) => norm(g.course) === key && isScheduled(g));
      const freeSeats = gs.reduce((s, g) => s + Math.max(0, capOf(g.room) - (g.enrolled ?? capOf(g.room))), 0);
      return { course, demand, groups: gs.length, freeSeats, gap: demand - freeSeats };
    })
    .sort((a, b) => b.gap - a.gap);
}

/** Free (room, start) pairs on a cohort that fit `duration` inside opening hours. */
export function freeSlots(
  groups: SchedGroup[],
  rooms: string[],
  cohort: Cohort,
  duration: number,
  open = '08:00',
  close = '21:00',
  step = 30,
): { room: string; time: string }[] {
  const out: { room: string; time: string }[] = [];
  for (const room of rooms)
    for (let t = toMin(open); t + duration <= toMin(close); t += step) {
      const time = fmtMin(t);
      const busy = groups.some((g) => isScheduled(g) && g.cohort === cohort && g.room === room && overlaps(time, duration, g.time, g.duration));
      if (!busy) out.push({ room, time });
    }
  return out;
}

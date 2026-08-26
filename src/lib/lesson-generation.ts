import 'server-only';
import { sql } from '@/lib/db/client';

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Mirrors /api/cron/lesson-plan-check's own weekday math exactly (both the
// Sunday skip and the odd/even split): Mon/Wed/Fri are 'odd', Tue/Thu/Sat
// are 'even' — a *weekly* rotation, not date-of-month parity. Generating
// slots with any other rule than this one would silently create rows a
// group's schedule_type never matches, which is exactly what happened
// before this fix: every non-Sunday day of the month got a slot regardless
// of the group's actual weekday rotation, so half of them sat there
// permanently blank and the other half doubled up against what the
// compliance check was already computing correctly on its own.
function weekdayParity(dateKey: string): 'odd' | 'even' {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay() % 2 === 1 ? 'odd' : 'even';
}

function isSunday(dateKey: string): boolean {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay() === 0;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Ensures `groupId` has a course_lessons row for every date in the given
 * month that actually matches its own weekly schedule_type ('odd' =
 * Mon/Wed/Fri, 'even' = Tue/Thu/Sat, Sunday always excluded) — so teachers
 * never manually "pick a date" on their real class days, without also
 * littering every *other* weekday with a slot the group never meets on. A
 * group with no schedule_type set yet falls back to every non-Sunday date
 * (better to over-generate for the rare unconfigured group than to give it
 * zero slots to write in at all).
 *
 * Idempotent: the `where not exists` guard runs inside the same insert
 * statement (not a separate pre-check query), so it's immune to any
 * client-side date-string-vs-`date`-column type mismatch — one atomic,
 * correctly-typed operation instead of a check-then-insert race.
 * `lesson_number` keeps incrementing per group rather than resetting per
 * month — nothing depends on it meaning "syllabus position 1-24" anymore,
 * only on it being a stable per-group ordering key (see `order by
 * lesson_number` in course-lessons-section.tsx).
 *
 * Returns how many rows were actually created.
 */
export async function generateLessonSlotsForMonth(groupId: string, year: number, month: number): Promise<number> {
  const [group] = await sql<{ schedule_type: 'odd' | 'even' | null }[]>`
    select schedule_type from groups where id = ${groupId}
  `;
  const scheduleType = group?.schedule_type ?? null;

  const total = daysInMonth(year, month);
  const dateKeys: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    const dateKey = toDateKey(year, month, day);
    if (isSunday(dateKey)) continue;
    if (scheduleType && weekdayParity(dateKey) !== scheduleType) continue;
    dateKeys.push(dateKey);
  }
  if (dateKeys.length === 0) return 0;

  const [{ maxNumber }] = await sql<{ maxNumber: number }[]>`
    select coalesce(max(lesson_number), 0)::int as "maxNumber" from course_lessons where group_id = ${groupId}
  `;

  const created = await sql<{ id: string }[]>`
    insert into course_lessons (group_id, lesson_number, lesson_date)
    select ${groupId}, ${maxNumber} + row_number() over (order by d), d
    from unnest(${dateKeys}::date[]) as d
    where not exists (
      select 1 from course_lessons cl where cl.group_id = ${groupId} and cl.lesson_date = d
    )
    returning id
  `;
  return created.length;
}

/** Every group, for wiring into the monthly cron and the one-time backfill script. */
export async function getAllGroupIds(): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from groups`;
  return rows.map((r) => r.id);
}

/**
 * What makes a lesson plan "done" — one definition shared by the nightly
 * compliance cron (lesson-plan-check) and every completeness ring in the UI,
 * so a full ring can never be reported as missing. Materials and procedure
 * are intentionally optional.
 */
export const PLAN_REQUIRED_FIELDS = ['topic', 'aim', 'language_focus', 'anticipated_problems', 'homework'] as const;
export type PlanRequiredField = (typeof PLAN_REQUIRED_FIELDS)[number];

export type PlanFields = Partial<Record<PlanRequiredField, string | null>>;

export function filledFields(lesson: PlanFields): number {
  return PLAN_REQUIRED_FIELDS.filter((f) => !!lesson[f]?.trim()).length;
}

export function isLessonPlanComplete(lesson: PlanFields): boolean {
  return filledFields(lesson) === PLAN_REQUIRED_FIELDS.length;
}

export type DayStatus = 'complete' | 'incomplete' | 'missing';

/**
 * A group's status for one day. A group can hold more than one row on a
 * date: it counts as done if any one is complete (or moved elsewhere with a
 * reason), missing if every row is blank and unmoved.
 */
export function groupDayStatus(lessons: (PlanFields & { moved_to_lesson_id?: string | null })[]): DayStatus {
  if (lessons.length === 0 || lessons.every((l) => filledFields(l) === 0 && !l.moved_to_lesson_id)) return 'missing';
  return lessons.some((l) => isLessonPlanComplete(l) || !!l.moved_to_lesson_id) ? 'complete' : 'incomplete';
}

/** The plan for `lessonDate` is due by 23:59 Tashkent the day before (UTC instant). */
export function planDeadline(lessonDate: string): Date {
  const [y, m, d] = lessonDate.split('-').map(Number);
  // 00:00 Tashkent on the lesson day = 19:00 UTC the day before; minus a minute.
  return new Date(Date.UTC(y, m - 1, d) - 5 * 3600_000 - 60_000);
}

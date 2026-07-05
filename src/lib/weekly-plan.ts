import { createClient } from '@/lib/supabase/server';

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type LessonPlanDay = {
  id: string;
  weekday: Weekday;
  topic: string | null;
  notes: string | null;
};

/** Monday-based week start, computed in UTC to avoid timezone drift. */
function getWeekStart(date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches (or, if the caller is allowed to write, creates) the current
 * week's lesson plan for a group. Non-owners without insert rights (e.g. an
 * assistant viewing before the teacher has created this week's plan yet)
 * just get an empty day list back instead of an RLS error.
 */
export async function getCurrentWeeklyPlan(groupId: string, canCreate: boolean) {
  const supabase = await createClient();
  const startDate = getWeekStart();
  const endDate = addDays(startDate, 6);

  const { data: existing } = await supabase
    .from('weekly_lesson_plans')
    .select('id')
    .eq('group_id', groupId)
    .eq('start_date', startDate)
    .maybeSingle();

  let weeklyPlanId = existing?.id ?? null;

  if (!weeklyPlanId && canCreate) {
    const { data: created } = await supabase
      .from('weekly_lesson_plans')
      .insert({ group_id: groupId, start_date: startDate, end_date: endDate })
      .select('id')
      .single();
    weeklyPlanId = created?.id ?? null;

    if (weeklyPlanId) {
      const newWeeklyPlanId = weeklyPlanId;
      await supabase
        .from('lesson_plan_days')
        .insert(WEEKDAYS.map((weekday) => ({ weekly_plan_id: newWeeklyPlanId, weekday })));
    }
  }

  if (!weeklyPlanId) {
    return { startDate, endDate, weeklyPlanId: null, days: [] as LessonPlanDay[] };
  }

  const { data: days } = await supabase
    .from('lesson_plan_days')
    .select('id, weekday, topic, notes')
    .eq('weekly_plan_id', weeklyPlanId);

  const sortedDays = WEEKDAYS.map((weekday) => (days ?? []).find((d) => d.weekday === weekday)).filter(
    (d): d is LessonPlanDay => Boolean(d),
  );

  return { startDate, endDate, weeklyPlanId, days: sortedDays };
}

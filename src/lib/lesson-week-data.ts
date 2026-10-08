import 'server-only';
import { sql } from '@/lib/db/client';
import type { LessonProcedureStep } from '@/lib/actions/course-lessons';

/** One lesson in the week / review views, with everything the side panel edits. */
export type WeekLesson = {
  id: string;
  group_id: string;
  group_name: string;
  course: string | null;
  time: string;
  room: string;
  teacher: string;
  teacher_id: string;
  lesson_date: string;
  lesson_number: number;
  topic: string | null;
  aim: string | null;
  language_focus: string | null;
  anticipated_problems: string | null;
  materials: string | null;
  homework: string | null;
  procedure: LessonProcedureStep[];
  moved_to_lesson_id: string | null;
  verdict: 'ok' | 'needs_work' | null;
  review_note: string | null;
  ai_score: number | null;
};

export type LessonScope = { kind: 'teacher'; id: string } | { kind: 'ta'; id: string } | { kind: 'all'; teacherId?: string | null };

/** Lessons dated in [from, to] (Tashkent day keys) within the viewer's scope. */
export async function loadLessonsBetween(scope: LessonScope, from: string, to: string): Promise<WeekLesson[]> {
  const teacherOnly = scope.kind === 'teacher' ? scope.id : scope.kind === 'all' ? (scope.teacherId ?? null) : null;
  const taOnly = scope.kind === 'ta' ? scope.id : null;
  return sql<WeekLesson[]>`
    select cl.id, cl.group_id, g.name as group_name, g.course_name as course,
      coalesce(g.configuration->>'time', '') as time, coalesce(trim(g.configuration->>'room'), '') as room,
      concat(t.first_name, ' ', t.last_name) as teacher, g.teacher_id,
      cl.lesson_date::text as lesson_date, cl.lesson_number, cl.topic, cl.aim, cl.language_focus,
      cl.anticipated_problems, cl.materials, cl.homework, coalesce(cl.procedure, '[]'::jsonb) as procedure,
      cl.moved_to_lesson_id, r.verdict, r.note as review_note, r.ai_score
    from course_lessons cl
    join groups g on g.id = cl.group_id
    left join profiles t on t.id = g.teacher_id
    left join lesson_reviews r on r.lesson_id = cl.id
    where cl.lesson_date between ${from} and ${to}
      and (${teacherOnly}::uuid is null or g.teacher_id = ${teacherOnly})
      and (${taOnly}::uuid is null or g.assigned_ta_id = ${taOnly})
    order by cl.lesson_date, coalesce(g.configuration->>'time', ''), g.name`;
}

export type DisciplineRow = { teacher_id: string; teacher: string; cells: Record<string, 'complete' | 'incomplete' | 'missing'> };

/** Teacher × day, from the nightly deadline snapshots (worst group wins). */
export async function loadDiscipline(from: string, to: string): Promise<DisciplineRow[]> {
  const rows = await sql<{ teacher_id: string; teacher: string; date_key: string; status: 'complete' | 'incomplete' | 'missing' }[]>`
    select d.teacher_id, concat(p.first_name, ' ', p.last_name) as teacher, d.date_key::text as date_key, d.status
    from lesson_plan_daily d join profiles p on p.id = d.teacher_id
    where d.date_key between ${from} and ${to}
    order by p.first_name`.catch(() => []);
  const rank = { complete: 0, incomplete: 1, missing: 2 } as const;
  const map = new Map<string, DisciplineRow>();
  for (const r of rows) {
    const row = map.get(r.teacher_id) ?? { teacher_id: r.teacher_id, teacher: r.teacher, cells: {} };
    const prev = row.cells[r.date_key];
    if (!prev || rank[r.status] > rank[prev]) row.cells[r.date_key] = r.status;
    map.set(r.teacher_id, row);
  }
  return [...map.values()];
}

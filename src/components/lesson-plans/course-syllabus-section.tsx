import { sql } from '@/lib/db/client';
import { CourseSyllabusPanel, type SyllabusRow } from './course-syllabus-panel';

/** Loads the group's 36-lesson syllabus (position, type, topic) and renders
 * the panel. Self-fetching so it streams behind its own Suspense boundary. */
export async function CourseSyllabusSection({ groupId, canManage }: { groupId: string; canManage: boolean }) {
  const rows = await sql<SyllabusRow[]>`
    select syllabus_position as pos, lesson_type as type, topic from course_lessons
    where group_id = ${groupId}
    order by syllabus_position asc nulls last, lesson_date asc nulls last, lesson_number asc
  `;
  return <CourseSyllabusPanel groupId={groupId} canManage={canManage} rows={rows} />;
}

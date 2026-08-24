import { sql } from '@/lib/db/client';
import { createSignedReadUrl } from '@/lib/gcp/storage';
import { CourseLessonsTable, type CourseLessonRow } from './course-lessons-table';
import type { LessonAttachment } from '@/lib/lesson-materials';
import type { LessonAttachmentWithUrl } from './lesson-files-cell';
import type { LessonComment, LessonCommentRole } from './lesson-comments-drawer';
import type { LessonProcedureStep } from '@/lib/actions/course-lessons';

// Self-fetching so it streams independently of the staff chat snippet on the
// group page, matching the pattern used for the rest of this group-detail view.
export async function CourseLessonsSection({
  groupId,
  canEditContent,
  canDeleteFiles,
  canComment,
  currentUserId,
  viewerName,
}: {
  groupId: string;
  canEditContent: boolean;
  canDeleteFiles: boolean;
  canComment: boolean;
  currentUserId: string;
  viewerName: string;
}) {
  const lessons = await sql<
    {
      id: string;
      lesson_number: number;
      lesson_date: string | null;
      topic: string | null;
      game_link: string | null;
      aim: string | null;
      language_focus: string | null;
      anticipated_problems: string | null;
      materials: string | null;
      homework: string | null;
      procedure: LessonProcedureStep[];
      attachments: LessonAttachment[];
      movedToDate: string | null;
      movedFromDate: string | null;
      moveReason: string | null;
    }[]
  >`
    select cl.id, cl.lesson_number, cl.lesson_date, cl.topic, cl.game_link, cl.aim, cl.language_focus,
      cl.anticipated_problems, cl.materials, cl.homework, cl.procedure, cl.attachments,
      moved_to.lesson_date as "movedToDate", moved_from.lesson_date as "movedFromDate", cl.move_reason as "moveReason"
    from course_lessons cl
    left join course_lessons moved_to on moved_to.id = cl.moved_to_lesson_id
    left join course_lessons moved_from on moved_from.id = cl.moved_from_lesson_id
    where cl.group_id = ${groupId} order by cl.lesson_number asc
  `;

  // Batch one signed-URL request for every attachment across all 24 lessons,
  // instead of one round trip per file. Caller access to this group is
  // already gated by the parent page before this component renders, so
  // signing every attachment path here doesn't widen anything.
  const allPaths = lessons.flatMap((l) => (l.attachments ?? []).map((a) => a.path));
  const signedUrlByPath = new Map<string, string>();
  if (allPaths.length > 0) {
    const signedUrls = await Promise.all(
      allPaths.map(async (path) => [path, await createSignedReadUrl('lesson_materials', path, 3600)] as const),
    );
    for (const [path, url] of signedUrls) signedUrlByPath.set(path, url);
  }

  const lessonIds = lessons.map((l) => l.id);
  const commentsByLesson = new Map<string, LessonComment[]>();
  if (lessonIds.length > 0) {
    const commentsRaw = await sql<
      { id: string; comment_text: string; created_at: string; user_id: string; lesson_id: string; first_name: string; last_name: string; role: string }[]
    >`
      select c.id, c.comment_text, c.created_at, c.user_id, c.lesson_id, p.first_name, p.last_name, p.role
      from lesson_comments c
      join profiles p on p.id = c.user_id
      where c.lesson_id in ${sql(lessonIds)}
      order by c.created_at asc
    `;

    for (const row of commentsRaw) {
      const comment: LessonComment = {
        id: row.id,
        comment_text: row.comment_text,
        created_at: row.created_at,
        user_id: row.user_id,
        authorName: `${row.first_name} ${row.last_name}`,
        authorRole: row.role as LessonCommentRole,
      };
      const bucket = commentsByLesson.get(row.lesson_id) ?? [];
      bucket.push(comment);
      commentsByLesson.set(row.lesson_id, bucket);
    }
  }

  const rows: CourseLessonRow[] = lessons.map((l) => {
    const attachments = (l.attachments as unknown as LessonAttachment[]) ?? [];
    const attachmentsWithUrl: LessonAttachmentWithUrl[] = attachments.map((a) => ({
      ...a,
      signedUrl: signedUrlByPath.get(a.path) ?? null,
    }));
    return {
      id: l.id,
      lesson_number: l.lesson_number,
      lesson_date: l.lesson_date,
      topic: l.topic,
      game_link: l.game_link,
      aim: l.aim,
      language_focus: l.language_focus,
      anticipated_problems: l.anticipated_problems,
      materials: l.materials,
      homework: l.homework,
      procedure: (l.procedure as unknown as LessonProcedureStep[]) ?? [],
      attachments: attachmentsWithUrl,
      comments: commentsByLesson.get(l.id) ?? [],
      movedToDate: l.movedToDate,
      movedFromDate: l.movedFromDate,
      moveReason: l.moveReason,
    };
  });

  return (
    <CourseLessonsTable
      groupId={groupId}
      lessons={rows}
      canEditContent={canEditContent}
      canDeleteFiles={canDeleteFiles}
      canComment={canComment}
      currentUserId={currentUserId}
      viewerName={viewerName}
    />
  );
}

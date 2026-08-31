import { getTranslations } from 'next-intl/server';
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
  currentMonthKey,
  canEditContent,
  canDeleteFiles,
  canComment,
  currentUserId,
  viewerName,
}: {
  groupId: string;
  /** 'YYYY-MM' in Asia/Tashkent, decided by the page — see its comment. */
  currentMonthKey: string;
  canEditContent: boolean;
  canDeleteFiles: boolean;
  canComment: boolean;
  currentUserId: string;
  viewerName: string;
}) {
  const t = await getTranslations('lessonPlans');
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

  // The teacher's working view is this month and this month only; every
  // other month is folded away behind its own collapsed header. A row with
  // no date yet has no month to be filed under and would otherwise vanish
  // from the page entirely — it stays in the current-month table, which is
  // also the only place its date can still be set.
  const monthOf = (row: CourseLessonRow) => (row.lesson_date ? row.lesson_date.slice(0, 7) : currentMonthKey);

  const currentMonthRows = rows.filter((row) => monthOf(row) === currentMonthKey);
  const byMonth = new Map<string, CourseLessonRow[]>();
  for (const row of rows) {
    const key = monthOf(row);
    if (key === currentMonthKey) continue;
    const bucket = byMonth.get(key) ?? [];
    bucket.push(row);
    byMonth.set(key, bucket);
  }

  const otherMonths = [...byMonth.keys()];
  // Past: newest first, so last month is the one nearest to hand. Future
  // months exist because slot generation runs a month ahead (see
  // createGroupAction / the monthly cron) and because a lesson can be moved
  // forward into one — they're collapsed like the past but stay editable,
  // since nothing about them is closed yet.
  const pastMonths = otherMonths.filter((key) => key < currentMonthKey).sort((a, b) => b.localeCompare(a));
  const upcomingMonths = otherMonths.filter((key) => key > currentMonthKey).sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-4">
      <CourseLessonsTable
        groupId={groupId}
        lessons={currentMonthRows}
        canEditContent={canEditContent}
        canDeleteFiles={canDeleteFiles}
        canComment={canComment}
        currentUserId={currentUserId}
        viewerName={viewerName}
      />

      {upcomingMonths.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold tracking-wider text-white/45 uppercase">
            {t('courseLessons.upcomingMonths')}
          </h3>
          {upcomingMonths.map((key) => (
            <CourseLessonsTable
              key={key}
              groupId={groupId}
              lessons={byMonth.get(key)!}
              monthKey={key}
              canEditContent={canEditContent}
              canDeleteFiles={canDeleteFiles}
              canComment={canComment}
              currentUserId={currentUserId}
              viewerName={viewerName}
            />
          ))}
        </div>
      )}

      {pastMonths.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold tracking-wider text-white/45 uppercase">
            {t('courseLessons.pastMonths')}
          </h3>
          {pastMonths.map((key) => (
            <CourseLessonsTable
              key={key}
              groupId={groupId}
              lessons={byMonth.get(key)!}
              monthKey={key}
              locked
              canEditContent={canEditContent}
              canDeleteFiles={canDeleteFiles}
              canComment={canComment}
              currentUserId={currentUserId}
              viewerName={viewerName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { CourseLessonsTable, type CourseLessonRow } from './course-lessons-table';
import type { LessonAttachment } from '@/lib/lesson-materials';
import type { LessonAttachmentWithUrl } from './lesson-files-cell';
import type { LessonComment, LessonCommentRole } from './lesson-comments-drawer';

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
  const supabase = await createClient();

  const { data: lessonsData } = await supabase
    .from('course_lessons')
    .select('id, lesson_number, lesson_date, topic, description, game_link, attachments')
    .eq('group_id', groupId)
    .order('lesson_number', { ascending: true });
  const lessons = lessonsData ?? [];

  // Batch one signed-URL request for every attachment across all 24 lessons,
  // instead of one round trip per file.
  const allPaths = lessons.flatMap((l) => ((l.attachments as unknown as LessonAttachment[]) ?? []).map((a) => a.path));
  const signedUrlByPath = new Map<string, string>();
  if (allPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from('lesson_materials').createSignedUrls(allPaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl && !s.error) signedUrlByPath.set(s.path ?? '', s.signedUrl);
    }
  }

  const lessonIds = lessons.map((l) => l.id);
  const commentsByLesson = new Map<string, LessonComment[]>();
  if (lessonIds.length > 0) {
    const { data: commentsRaw } = await supabase
      .from('lesson_comments')
      .select(
        'id, comment_text, created_at, user_id, lesson_id, author:profiles!lesson_comments_user_id_fkey(first_name, last_name, role)',
      )
      .in('lesson_id', lessonIds)
      .order('created_at', { ascending: true });

    for (const row of (commentsRaw as never as {
      id: string;
      comment_text: string;
      created_at: string;
      user_id: string;
      lesson_id: string;
      author: { first_name: string; last_name: string; role: string } | null;
    }[]) ?? []) {
      if (!row.author) continue;
      const comment: LessonComment = {
        id: row.id,
        comment_text: row.comment_text,
        created_at: row.created_at,
        user_id: row.user_id,
        authorName: `${row.author.first_name} ${row.author.last_name}`,
        authorRole: row.author.role as LessonCommentRole,
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
      description: l.description,
      game_link: l.game_link,
      attachments: attachmentsWithUrl,
      comments: commentsByLesson.get(l.id) ?? [],
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

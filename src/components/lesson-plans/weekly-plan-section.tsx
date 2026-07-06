import { createClient } from '@/lib/supabase/server';
import { getCurrentWeeklyPlan } from '@/lib/weekly-plan';
import { WeeklyPlanPanel, type DayWithComments } from './weekly-plan-panel';
import type { Comment, CommentRole } from './day-comments';

// Self-fetching so it streams independently of HomeworkPanel and the staff
// chat snippet on the group page, instead of one shared await blocking all
// three sections together.
export async function WeeklyPlanSection({
  groupId,
  canEdit,
  currentUserId,
  viewerName,
  viewerRole,
  canComment,
}: {
  groupId: string;
  canEdit: boolean;
  currentUserId: string;
  viewerName: string;
  viewerRole: CommentRole | 'teacher';
  canComment: boolean;
}) {
  const supabase = await createClient();
  const { days } = await getCurrentWeeklyPlan(groupId, canEdit);

  let daysWithComments: DayWithComments[] = days.map((d) => ({ ...d, comments: [] }));

  if (days.length > 0) {
    const { data: commentsRaw } = await supabase
      .from('lesson_plan_comments')
      .select(
        'id, comment_text, created_at, user_id, lesson_plan_day_id, author:profiles!lesson_plan_comments_user_id_fkey(first_name, last_name, role)',
      )
      .in(
        'lesson_plan_day_id',
        days.map((d) => d.id),
      )
      .order('created_at', { ascending: true });

    const commentsByDay = new Map<string, Comment[]>();
    for (const row of (commentsRaw as never as {
      id: string;
      comment_text: string;
      created_at: string;
      user_id: string;
      lesson_plan_day_id: string;
      author: { first_name: string; last_name: string; role: string } | null;
    }[]) ?? []) {
      if (!row.author) continue;
      const comment: Comment = {
        id: row.id,
        comment_text: row.comment_text,
        created_at: row.created_at,
        user_id: row.user_id,
        authorName: `${row.author.first_name} ${row.author.last_name}`,
        authorRole: row.author.role as CommentRole,
      };
      const bucket = commentsByDay.get(row.lesson_plan_day_id) ?? [];
      bucket.push(comment);
      commentsByDay.set(row.lesson_plan_day_id, bucket);
    }

    daysWithComments = days.map((d) => ({ ...d, comments: commentsByDay.get(d.id) ?? [] }));
  }

  return (
    <WeeklyPlanPanel
      days={daysWithComments}
      canEdit={canEdit}
      currentUserId={currentUserId}
      viewerName={viewerName}
      viewerRole={viewerRole}
      canComment={canComment}
    />
  );
}

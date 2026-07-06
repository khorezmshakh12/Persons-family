import { notFound } from 'next/navigation';
// Aliased: this file also exports the route-segment config `dynamic` below.
import nextDynamic from 'next/dynamic';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWeeklyPlan } from '@/lib/weekly-plan';
import type { GroupConfiguration } from '@/components/lesson-plans/edit-group-dialog';
import { DeleteGroupButton } from '@/components/lesson-plans/delete-group-button';
import { WeeklyPlanPanel, type DayWithComments } from '@/components/lesson-plans/weekly-plan-panel';
import { HomeworkPanel, type SubmissionsByKey } from '@/components/lesson-plans/homework-panel';
import { GroupStaffChatSnippet } from '@/components/lesson-plans/group-staff-chat-snippet';
import type { Comment, CommentRole } from '@/components/lesson-plans/day-comments';
import type { SubmissionStatus } from '@/components/lesson-plans/submission-status-select';

const EditGroupDialog = nextDynamic(() =>
  import('@/components/lesson-plans/edit-group-dialog').then((mod) => mod.EditGroupDialog),
);

export const dynamic = 'force-dynamic';

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const t = await getTranslations('lessonPlans');
  const { user, profile } = await getAuthState();
  const supabase = await createClient();

  const { data: group } = await supabase
    .from('groups')
    .select('id, name, teacher_id, configuration, teacher:profiles!groups_teacher_id_fkey(first_name, last_name)')
    .eq('id', groupId)
    .maybeSingle();

  if (!group) notFound();

  const isOwnerTeacher = profile!.role === 'teacher' && group.teacher_id === user!.id;
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';
  const isAssistant = profile!.role === 'assistant';

  // A different teacher (not the owner) should never see this group.
  if (profile!.role === 'teacher' && !isOwnerTeacher) notFound();

  const canEditGroup = isOwnerTeacher || isAdmin;
  const canComment = isAdmin || isAssistant;
  const viewerRole: CommentRole | 'teacher' = isOwnerTeacher ? 'teacher' : (profile!.role as CommentRole);
  const isTeacherOrAssistant = profile!.role === 'teacher' || profile!.role === 'assistant';

  const { days } = await getCurrentWeeklyPlan(groupId, canEditGroup);

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

  const { data: assignments } = await supabase
    .from('homework_assignments')
    .select('id, title, description, due_date')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  const { data: students } = await supabase
    .from('homework_students')
    .select('id, full_name')
    .eq('group_id', groupId)
    .order('full_name', { ascending: true });

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const submissionsByKey: SubmissionsByKey = {};
  if (assignmentIds.length > 0) {
    const { data: submissions } = await supabase
      .from('homework_submissions')
      .select('assignment_id, student_id, status')
      .in('assignment_id', assignmentIds);
    for (const s of submissions ?? []) {
      submissionsByKey[`${s.assignment_id}_${s.student_id}`] = s.status as SubmissionStatus;
    }
  }

  const configuration = group.configuration as GroupConfiguration;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center gap-2 text-sm text-white/60">
        <Link href="/lesson-plans" className="hover:text-white">
          {t('title')}
        </Link>
        <span>→</span>
        <span className="font-semibold text-white">{group.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
          <p className="text-sm text-white/60">
            {[configuration.subject, configuration.level, configuration.schedule, configuration.room]
              .filter(Boolean)
              .join(' · ') || t('noConfiguration')}
          </p>
        </div>
        {canEditGroup && (
          <div className="flex shrink-0 gap-2">
            <EditGroupDialog groupId={group.id} name={group.name} configuration={configuration} />
            <DeleteGroupButton groupId={group.id} />
          </div>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('weeklyPlanTitle')}</h2>
        <WeeklyPlanPanel
          days={daysWithComments}
          canEdit={canEditGroup}
          currentUserId={user!.id}
          viewerRole={viewerRole}
          canComment={canComment}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HomeworkPanel
          groupId={group.id}
          canEdit={canEditGroup}
          assignments={assignments ?? []}
          students={students ?? []}
          submissionsByKey={submissionsByKey}
        />
        {isTeacherOrAssistant && <GroupStaffChatSnippet groupId={group.id} groupName={group.name} />}
      </div>
    </div>
  );
}

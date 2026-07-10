import { Suspense } from 'react';
import { notFound } from 'next/navigation';
// Aliased: this file also exports the route-segment config `dynamic` below.
import nextDynamic from 'next/dynamic';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { GroupConfiguration } from '@/components/lesson-plans/edit-group-dialog';
import { DeleteGroupButton } from '@/components/lesson-plans/delete-group-button';
import { CourseLessonsSection } from '@/components/lesson-plans/course-lessons-section';
import { GroupStaffChatSnippet } from '@/components/lesson-plans/group-staff-chat-snippet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import {
  GlassCardSkeleton,
  GlassCourseLessonsSkeleton,
} from '@/components/skeletons/glass-skeletons';

const EditGroupDialog = nextDynamic(() =>
  import('@/components/lesson-plans/edit-group-dialog').then((mod) => mod.EditGroupDialog),
);

export const dynamic = 'force-dynamic';

// Only the group row itself (needed for the header + notFound/ownership
// gate) blocks the initial render. The course lessons table and staff chat
// snippet each fetch their own data and stream in behind independent
// Suspense boundaries, so one slow section never holds up the other.
export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const t = await getTranslations('lessonPlans');
  const { user, profile } = await getAuthState();
  const supabase = await createClient();

  const { data: group } = await supabase
    .from('groups')
    .select(
      'id, name, teacher_id, assigned_ta_id, configuration, course_name, schedule_type, teacher:profiles!groups_teacher_id_fkey(first_name, last_name, avatar_url)',
    )
    .eq('id', groupId)
    .maybeSingle();

  if (!group) notFound();

  const isOwnerTeacher = profile!.role === 'teacher' && group.teacher_id === user!.id;
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';
  const isAssistant = profile!.role === 'assistant';
  // Only the assistant specifically assigned to this group counts as "the
  // group's TA" now — RLS already narrows their access to this group alone,
  // this just drives which UI a non-owner/non-admin assistant sees.
  const isAssignedTa = isAssistant && group.assigned_ta_id === user!.id;

  // A different teacher (not the owner) should never see this group. An
  // assistant who isn't the one assigned to this group shouldn't either —
  // RLS would return no row for them anyway, but this gives a clean 404
  // instead of relying solely on the RLS-empty-row fallthrough.
  if (profile!.role === 'teacher' && !isOwnerTeacher) notFound();
  if (isAssistant && !isAssignedTa) notFound();

  const canEditGroup = isOwnerTeacher || isAdmin;
  // Course lesson permissions per spec: only the owning teacher sets
  // dates/topics/uploads; the CEO (not admin_manager) can additionally
  // clear/delete a file; CEO/Admin/the assigned TA can comment, the teacher
  // can't.
  const canEditLessonContent = isOwnerTeacher;
  const canDeleteLessonFiles = isOwnerTeacher || profile!.role === 'ceo';
  const canComment = isAdmin || isAssignedTa;
  // Group staff chat: the owning teacher and assigned TA can read + post;
  // CEO/Admin can read-only ("monitor"). A non-assigned assistant never
  // reaches this branch (notFound() above already caught them).
  const canViewGroupChat = isOwnerTeacher || isAssignedTa || isAdmin;
  const canPostGroupChat = isOwnerTeacher || isAssignedTa;

  const configuration = group.configuration as GroupConfiguration;

  let assistants: { id: string; first_name: string; last_name: string }[] = [];
  if (canEditGroup) {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'assistant')
      .eq('is_active', true)
      .order('first_name', { ascending: true });
    assistants = data ?? [];
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center gap-2 text-sm text-white/60">
        <Link href="/lesson-plans" className="hover:text-white">
          {t('title')}
        </Link>
        <span>→</span>
        <span className="font-semibold text-white">{group.name}</span>
      </div>

      <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-teal-300/30 bg-teal-400/15 px-4 py-1.5 text-sm font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              {t('groupLabel')}: {group.name}
            </span>
            {group.teacher && (
              <span className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 py-1 pr-4 pl-1.5 text-sm font-medium text-white">
                <Avatar className="size-7 border border-white/30">
                  <AvatarImage src={group.teacher.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-white/10 text-xs text-white">
                    {group.teacher.first_name[0]}
                    {group.teacher.last_name[0]}
                  </AvatarFallback>
                </Avatar>
                {t('teacherLabel')}: {group.teacher.first_name} {group.teacher.last_name}
              </span>
            )}
          </div>
          {canEditGroup && (
            <div className="flex shrink-0 gap-2">
              <EditGroupDialog
                groupId={group.id}
                name={group.name}
                configuration={configuration}
                assignedTaId={group.assigned_ta_id}
                assistants={assistants}
                courseName={group.course_name}
                scheduleType={group.schedule_type}
              />
              <DeleteGroupButton groupId={group.id} />
            </div>
          )}
        </div>
        <p className="text-sm text-white/60">
          {[
            group.course_name,
            group.schedule_type ? t(`scheduleType.${group.schedule_type}`) : null,
            configuration.subject,
            configuration.time,
            configuration.room,
          ]
            .filter(Boolean)
            .join(' · ') || t('noConfiguration')}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('courseLessons.title')}</h2>
        <Suspense fallback={<GlassCourseLessonsSkeleton />}>
          <CourseLessonsSection
            groupId={group.id}
            canEditContent={canEditLessonContent}
            canDeleteFiles={canDeleteLessonFiles}
            canComment={canComment}
            currentUserId={user!.id}
            viewerName={`${profile!.first_name} ${profile!.last_name}`}
          />
        </Suspense>
      </section>

      {canViewGroupChat && (
        <Suspense fallback={<GlassCardSkeleton />}>
          <GroupStaffChatSnippet groupId={group.id} groupName={group.name} canPost={canPostGroupChat} />
        </Suspense>
      )}
    </div>
  );
}

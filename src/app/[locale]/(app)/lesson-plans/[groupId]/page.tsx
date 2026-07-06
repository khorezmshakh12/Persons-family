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
import { HomeworkPanel } from '@/components/lesson-plans/homework-panel';
import { GroupStaffChatSnippet } from '@/components/lesson-plans/group-staff-chat-snippet';
import {
  GlassCardSkeleton,
  GlassCourseLessonsSkeleton,
} from '@/components/skeletons/glass-skeletons';

const EditGroupDialog = nextDynamic(() =>
  import('@/components/lesson-plans/edit-group-dialog').then((mod) => mod.EditGroupDialog),
);

export const dynamic = 'force-dynamic';

// Only the group row itself (needed for the header + notFound/ownership
// gate) blocks the initial render. The weekly plan, homework, and staff
// chat snippet each fetch their own data and stream in behind independent
// Suspense boundaries, so one slow section never holds up the other two.
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
  // Course lesson permissions per spec: only the owning teacher sets
  // dates/topics/uploads; the CEO (not admin_manager) can additionally
  // clear/delete a file; CEO/Admin/assistant can comment, the teacher can't.
  const canEditLessonContent = isOwnerTeacher;
  const canDeleteLessonFiles = isOwnerTeacher || profile!.role === 'ceo';
  const canComment = isAdmin || isAssistant;
  const isTeacherOrAssistant = profile!.role === 'teacher' || profile!.role === 'assistant';

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
        <h2 className="text-xl font-semibold tracking-tight">{t('courseLessons.title')}</h2>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Suspense fallback={<GlassCardSkeleton />}>
          <HomeworkPanel groupId={group.id} canEdit={canEditGroup} />
        </Suspense>
        {isTeacherOrAssistant && (
          <Suspense fallback={<GlassCardSkeleton />}>
            <GroupStaffChatSnippet groupId={group.id} groupName={group.name} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

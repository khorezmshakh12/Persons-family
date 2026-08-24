import { Suspense } from 'react';
import { notFound } from 'next/navigation';
// Aliased: this file also exports the route-segment config `dynamic` below.
import nextDynamic from 'next/dynamic';
import { getTranslations, getLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { LESSON_PLAN_ROLES } from '@/lib/nav';
import type { GroupConfiguration } from '@/components/lesson-plans/edit-group-dialog';
import { DeleteGroupButton } from '@/components/lesson-plans/delete-group-button';
import { CourseLessonsSection } from '@/components/lesson-plans/course-lessons-section';
import { GroupStaffChatSnippet } from '@/components/lesson-plans/group-staff-chat-snippet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
  const locale = await getLocale();

  // Lesson-plan visibility is CEO / Head Teacher / IT Developer (view-only,
  // re-added so it can investigate compliance-bot reports) / owning teacher
  // / assigned TA only. This used to lean on RLS returning no row for
  // anyone else, with the redirect just making that a clean bounce instead
  // of a bare 404 — RLS is gone, so the allowlist (LESSON_PLAN_ROLES) is
  // now the only thing enforcing it and must cover every role that should
  // pass.
  if (!LESSON_PLAN_ROLES.includes(profile!.role)) {
    redirect({ href: '/dashboard', locale });
  }

  const [groupRow] = await sql<
    {
      id: string;
      name: string;
      teacher_id: string;
      assigned_ta_id: string | null;
      configuration: GroupConfiguration;
      course_name: string | null;
      schedule_type: 'odd' | 'even' | null;
      teacher_first_name: string;
      teacher_last_name: string;
      teacher_avatar_url: string | null;
    }[]
  >`
    select g.id, g.name, g.teacher_id, g.assigned_ta_id, g.configuration, g.course_name, g.schedule_type,
      t.first_name as teacher_first_name, t.last_name as teacher_last_name, t.avatar_url as teacher_avatar_url
    from groups g
    join profiles t on t.id = g.teacher_id
    where g.id = ${groupId}
  `;

  if (!groupRow) notFound();

  const group = {
    id: groupRow.id,
    name: groupRow.name,
    teacher_id: groupRow.teacher_id,
    assigned_ta_id: groupRow.assigned_ta_id,
    configuration: groupRow.configuration,
    course_name: groupRow.course_name,
    schedule_type: groupRow.schedule_type,
    teacher: {
      first_name: groupRow.teacher_first_name,
      last_name: groupRow.teacher_last_name,
      avatar_url: await resolveAvatarUrl(groupRow.teacher_avatar_url),
    },
  };

  const isOwnerTeacher = profile!.role === 'teacher' && group.teacher_id === user!.id;
  // Head Teacher only got view + comment rights (mirrors lesson_comments_*
  // RLS) — group management and content moderation (course_lessons_update /
  // lesson_materials_*) stayed CEO-only, so isCeo itself must stay literal
  // 'ceo' rather than folding head_teacher in here too.
  const isCeo = profile!.role === 'ceo';
  const isHeadTeacher = profile!.role === 'head_teacher';
  const isAssistant = profile!.role === 'assistant';
  // Only the assistant specifically assigned to this group counts as "the
  // group's TA" now — RLS already narrows their access to this group alone,
  // this just drives which UI a non-owner/non-admin assistant sees.
  const isAssignedTa = isAssistant && group.assigned_ta_id === user!.id;

  // A different teacher (not the owner) should never see this group. An
  // assistant who isn't the one assigned to this group shouldn't either.
  // These two used to be belt-and-braces on top of RLS returning no row;
  // with RLS gone the group row above is fetched by id alone, so they are
  // now the actual per-row gate (CEO/Head Teacher intentionally see every
  // group, matching is_admin()/head_teacher in groups_select).
  if (profile!.role === 'teacher' && !isOwnerTeacher) notFound();
  if (isAssistant && !isAssignedTa) notFound();

  // Group management (name/schedule/TA assignment) is now CEO-or-owner
  // only — an Administrative Manager no longer has any group-editing
  // function, per the role rework.
  const canEditGroup = isOwnerTeacher || isCeo;
  // Course lesson permissions per spec: only the owning teacher sets
  // dates/topics/uploads; the CEO can additionally clear/delete a file;
  // CEO/Head Teacher/the assigned TA can comment, the teacher can't comment
  // on their own lesson. IT Developer is view-only (sees content, can't
  // edit or comment) — Administrative Manager still has no lesson-plan
  // access at all — see the redirect above.
  const canEditLessonContent = isOwnerTeacher;
  const canDeleteLessonFiles = isOwnerTeacher || isCeo;
  const canComment = isCeo || isHeadTeacher || isAssignedTa;
  // Group staff chat: the owning teacher and assigned TA can read + post;
  // the CEO reads only ("monitor"). A non-assigned assistant never reaches
  // this branch (notFound() above already caught them).
  const canViewGroupChat = isOwnerTeacher || isAssignedTa || isCeo;
  const canPostGroupChat = isOwnerTeacher || isAssignedTa;

  const configuration = group.configuration as GroupConfiguration;

  let assistants: { id: string; first_name: string; last_name: string }[] = [];
  if (canEditGroup) {
    assistants = await sql<{ id: string; first_name: string; last_name: string }[]>`
      select id, first_name, last_name from profiles
      where role = 'assistant' and is_active = true
      order by first_name asc
    `;
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

      <div className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="tint" tint="slate" className="px-4 py-1.5 text-sm font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              {t('groupLabel')}: {group.name}
            </Badge>
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
        <h2 className="font-heading text-xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('courseLessons.title')}</h2>
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

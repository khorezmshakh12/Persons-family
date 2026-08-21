import { Suspense } from 'react';
// Aliased: this file also exports the route-segment config `dynamic` below.
import nextDynamic from 'next/dynamic';
import { getTranslations, getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { LESSON_PLAN_ROLES } from '@/lib/nav';
import { GroupsGrid } from '@/components/lesson-plans/groups-grid';
import { GroupFilters } from '@/components/lesson-plans/group-filters';
import { GlassGroupGridSkeleton } from '@/components/skeletons/glass-skeletons';

const CreateGroupDialog = nextDynamic(() =>
  import('@/components/lesson-plans/create-group-dialog').then((mod) => mod.CreateGroupDialog),
);

export const dynamic = 'force-dynamic';

export default async function LessonPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; teacher?: string }>;
}) {
  const { days, teacher } = await searchParams;
  const t = await getTranslations('lessonPlans');
  const { profile } = await getAuthState();
  const locale = await getLocale();

  // Lesson-plan visibility is CEO / Head Teacher / owning teacher / assigned
  // TA only — see 20260806110000_remove_admin_manager_lesson_plan_access.sql
  // (Administrative Manager dropped) and
  // 20260812090100_head_teacher_and_it_developer_rls.sql (IT Developer
  // dropped, Head Teacher taking its place). The nav item is already hidden
  // for everyone else (src/lib/nav.ts); this blocks a direct visit to the URL
  // too. Kept as an allowlist matching that nav entry rather than a denylist
  // of the two roles that lost access — RLS used to return zero rows for any
  // other role (mmd, internship), and with RLS gone a denylist
  // would let those roles straight through.
  if (!LESSON_PLAN_ROLES.includes(profile!.role)) {
    redirect({ href: '/dashboard', locale });
  }

  const isTeacher = profile!.role === 'teacher';

  let assistants: { id: string; first_name: string; last_name: string }[] = [];
  if (isTeacher) {
    assistants = await sql<{ id: string; first_name: string; last_name: string }[]>`
      select id, first_name, last_name from profiles
      where role = 'assistant' and is_active = true
      order by first_name asc
    `;
  }

  // The "filter by teacher" dropdown only makes sense for a viewer who can
  // see more than one teacher's groups in the first place.
  let teachers: { id: string; first_name: string; last_name: string }[] = [];
  if (!isTeacher) {
    teachers = await sql<{ id: string; first_name: string; last_name: string }[]>`
      select id, first_name, last_name from profiles
      where role = 'teacher' and is_active = true
      order by first_name asc
    `;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        {isTeacher && <CreateGroupDialog assistants={assistants} />}
      </div>

      <GroupFilters teachers={teachers} />

      <Suspense fallback={<GlassGroupGridSkeleton />}>
        <GroupsGrid days={days} teacherId={teacher} />
      </Suspense>
    </div>
  );
}

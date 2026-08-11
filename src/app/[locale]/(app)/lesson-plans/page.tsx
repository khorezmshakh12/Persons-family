import { Suspense } from 'react';
// Aliased: this file also exports the route-segment config `dynamic` below.
import nextDynamic from 'next/dynamic';
import { getTranslations, getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
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

  // Administrative Manager has no lesson-plan visibility at all anymore —
  // see 20260806110000_remove_admin_manager_lesson_plan_access.sql. IT
  // Developer lost it too (Head Teacher takes its place — see
  // 20260812090100_head_teacher_and_it_developer_rls.sql). The nav item is
  // already hidden for both roles (src/lib/nav.ts); this blocks a direct
  // visit to the URL too.
  if (profile!.role === 'admin_manager' || profile!.role === 'it_developer') {
    redirect({ href: '/dashboard', locale });
  }

  const isTeacher = profile!.role === 'teacher';
  const supabase = await createClient();

  let assistants: { id: string; first_name: string; last_name: string }[] = [];
  if (isTeacher) {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'assistant')
      .eq('is_active', true)
      .order('first_name', { ascending: true });
    assistants = data ?? [];
  }

  // The "filter by teacher" dropdown only makes sense for a viewer who can
  // see more than one teacher's groups in the first place.
  let teachers: { id: string; first_name: string; last_name: string }[] = [];
  if (!isTeacher) {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'teacher')
      .eq('is_active', true)
      .order('first_name', { ascending: true });
    teachers = data ?? [];
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

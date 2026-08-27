import { Suspense } from 'react';
// Aliased: this file also exports the route-segment config `dynamic` below.
import nextDynamic from 'next/dynamic';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
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
  // Role gating for this whole section happens in lesson-plans/layout.tsx —
  // see its comment for why that redirect can't live here.
  const { profile } = await getAuthState();

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

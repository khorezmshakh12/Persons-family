import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { CreateGroupDialog } from '@/components/lesson-plans/create-group-dialog';
import { GroupsGrid } from '@/components/lesson-plans/groups-grid';
import { GlassGroupGridSkeleton } from '@/components/skeletons/glass-skeletons';

export const dynamic = 'force-dynamic';

export default async function LessonPlansPage() {
  const t = await getTranslations('lessonPlans');
  const { profile } = await getAuthState();
  const isTeacher = profile!.role === 'teacher';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {isTeacher && <CreateGroupDialog />}
      </div>

      <Suspense fallback={<GlassGroupGridSkeleton />}>
        <GroupsGrid />
      </Suspense>
    </div>
  );
}

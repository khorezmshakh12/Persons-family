import { Suspense } from 'react';
// Aliased: this file also exports the route-segment config `dynamic` below.
import nextDynamic from 'next/dynamic';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GroupsGrid } from '@/components/lesson-plans/groups-grid';
import { GlassGroupGridSkeleton } from '@/components/skeletons/glass-skeletons';

const CreateGroupDialog = nextDynamic(() =>
  import('@/components/lesson-plans/create-group-dialog').then((mod) => mod.CreateGroupDialog),
);

export const dynamic = 'force-dynamic';

export default async function LessonPlansPage() {
  const t = await getTranslations('lessonPlans');
  const { profile } = await getAuthState();
  const isTeacher = profile!.role === 'teacher';

  let assistants: { id: string; first_name: string; last_name: string }[] = [];
  if (isTeacher) {
    const supabase = await createClient();
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{t('title')}</h1>
        {isTeacher && <CreateGroupDialog assistants={assistants} />}
      </div>

      <Suspense fallback={<GlassGroupGridSkeleton />}>
        <GroupsGrid />
      </Suspense>
    </div>
  );
}

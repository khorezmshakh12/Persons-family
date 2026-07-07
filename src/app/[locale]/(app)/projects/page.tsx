import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { ProjectList } from '@/components/projects/project-list';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { GlassGroupGridSkeleton } from '@/components/skeletons/glass-skeletons';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const t = await getTranslations('projects');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <CreateProjectDialog />
      </div>
      <Suspense fallback={<GlassGroupGridSkeleton />}>
        <ProjectList />
      </Suspense>
    </div>
  );
}

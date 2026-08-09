import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { ProjectCard } from '@/components/projects/project-card';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const { profile } = await getAuthState();
  if (profile!.role !== 'ceo' && profile!.role !== 'admin_manager') notFound();

  const t = await getTranslations('projects');
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('future_projects')
    .select('id, title, initial_steps, estimated_budget')
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="text-white/70">{t('subtitle')}</p>
      </div>

      <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
        <CreateProjectDialog />
        {(projects ?? []).length === 0 ? (
          <p className="text-sm text-white/60">{t('noProjects')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(projects ?? []).map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

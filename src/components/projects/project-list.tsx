import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { ProjectCard, type Project } from './project-card';

export async function ProjectList() {
  const t = await getTranslations('projects');
  const supabase = await createClient();

  const { data } = await supabase
    .from('future_projects')
    .select('id, title, initial_steps, estimated_budget')
    .order('created_at', { ascending: false });
  const projects = (data as unknown as Project[]) ?? [];

  if (projects.length === 0) {
    return <p className="text-sm text-white/70">{t('noProjects')}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}

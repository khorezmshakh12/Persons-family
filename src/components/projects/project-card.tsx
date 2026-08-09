'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteProjectAction } from '@/lib/actions/projects';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export type ProjectItem = {
  id: string;
  title: string;
  initial_steps: unknown;
  estimated_budget: number | null;
};

function formatBudget(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function ProjectCard({ project }: { project: ProjectItem }) {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const [isDeleting, startDelete] = useTransition();
  const steps = Array.isArray(project.initial_steps) ? (project.initial_steps as string[]) : [];

  function handleDelete() {
    startDelete(async () => {
      const formData = new FormData();
      formData.set('projectId', project.id);
      const result = await deleteProjectAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-white">{project.title}</span>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('deleteProject')}
                className="border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
              />
            }
          >
            <Trash2 className="size-3.5" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('confirmDeleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('confirmDeleteDescription', { title: project.title })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                disabled={isDeleting}
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? <Loader2 className="size-4 animate-spin" /> : t('confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {steps.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-white/80">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-white/40">•</span>
              <span>{step}</span>
            </li>
          ))}
        </ul>
      )}

      {project.estimated_budget !== null && (
        <span className="text-sm text-white/60">
          {t('estimatedBudget')}: {formatBudget(project.estimated_budget)}
        </span>
      )}
    </div>
  );
}

'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Trash2, X } from 'lucide-react';
import {
  updateProjectStepsAction,
  updateProjectBudgetAction,
  deleteProjectAction,
  type ProjectStep,
  type ProjectActionState,
} from '@/lib/actions/projects';
import { formatUZS } from '@/lib/format-currency';
import { CurrencyInput } from '@/components/staff/currency-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type Project = {
  id: string;
  title: string;
  initial_steps: ProjectStep[];
  estimated_budget: number | null;
};

export function ProjectCard({ project }: { project: Project }) {
  const t = useTranslations('projects');
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<ProjectStep[]>(project.initial_steps);
  const [newStepText, setNewStepText] = useState('');
  const [isSavingSteps, startSavingSteps] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [budgetState, budgetFormAction, isBudgetPending] = useActionState<ProjectActionState, FormData>(
    updateProjectBudgetAction,
    undefined,
  );

  useEffect(() => {
    if (budgetState?.success) toast.success(t('budgetSaved'));
    else if (budgetState?.error) toast.error(t(`errors.${budgetState.error}`));
  }, [budgetState, t]);

  function persistSteps(next: ProjectStep[]) {
    setSteps(next);
    startSavingSteps(async () => {
      const result = await updateProjectStepsAction(project.id, next);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  function addStep() {
    const text = newStepText.trim();
    if (!text) return;
    persistSteps([...steps, { id: crypto.randomUUID(), text, done: false }]);
    setNewStepText('');
  }

  function toggleStep(id: string) {
    persistSteps(steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }

  function removeStep(id: string) {
    persistSteps(steps.filter((s) => s.id !== id));
  }

  function handleDelete() {
    const formData = new FormData();
    formData.set('id', project.id);
    startDeleteTransition(() => {
      deleteProjectAction(formData);
    });
  }

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(GLASS_CARD, GLASS_INTERACTIVE, 'flex flex-col gap-2 p-5 text-left')}
          />
        }
      >
        <span className="text-lg font-semibold text-white">{project.title}</span>
        <span className="text-sm text-white/70">
          {steps.length > 0 ? t('stepsProgress', { done: completedCount, total: steps.length }) : t('noSteps')}
        </span>
        <span className="text-sm font-medium text-teal-200">
          {project.estimated_budget !== null
            ? `${formatUZS(project.estimated_budget)} ${t('currency')}`
            : t('noBudget')}
        </span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('estimatedBudget')}</span>
            <form action={budgetFormAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={project.id} />
              <CurrencyInput
                id={`budget-${project.id}`}
                name="estimatedBudget"
                defaultValue={project.estimated_budget ?? 0}
              />
              <Button type="submit" size="sm" disabled={isBudgetPending}>
                {isBudgetPending ? t('saving') : t('save')}
              </Button>
            </form>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('initialSteps')}</span>
            <div className="flex flex-col gap-1.5">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={step.done}
                    onChange={() => toggleStep(step.id)}
                    disabled={isSavingSteps}
                    className="size-4 accent-teal-400"
                  />
                  <span className={cn('flex-1 text-sm', step.done && 'text-white/40 line-through')}>
                    {step.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeStep(step.id)}
                    disabled={isSavingSteps}
                    aria-label={t('removeStep')}
                  >
                    <X className="size-3.5 text-white/40 hover:text-red-300" />
                  </button>
                </div>
              ))}
              {steps.length === 0 && <p className="text-xs text-white/50">{t('noSteps')}</p>}
            </div>
            <div className="flex gap-2">
              <Input
                value={newStepText}
                onChange={(e) => setNewStepText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addStep();
                  }
                }}
                placeholder={t('addStepPlaceholder')}
                maxLength={300}
              />
              <Button type="button" size="sm" onClick={addStep} disabled={isSavingSteps || !newStepText.trim()}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={isDeletePending}
            className="w-fit border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
          >
            <Trash2 className="size-4" />
            {t('deleteProject')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

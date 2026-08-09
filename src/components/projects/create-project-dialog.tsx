'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { createProjectAction, type ProjectActionState } from '@/lib/actions/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function CreateProjectDialog() {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ProjectActionState, FormData>(
    createProjectAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    } else if (state && !state.error) {
      toast.success(t('projectAdded'));
      setOpen(false);
    }
  }, [state, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="w-fit border-white/30 bg-white/10 text-white hover:bg-white/20" />
        }
      >
        <Plus className="size-4" />
        {t('addProject')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addProject')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-title">{t('projectTitle')}</Label>
            <Input id="project-title" name="title" placeholder={t('projectTitlePlaceholder')} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-steps">{t('initialSteps')}</Label>
            <Textarea
              id="project-steps"
              name="steps"
              placeholder={t('initialStepsPlaceholder')}
              rows={4}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-budget">{t('estimatedBudget')}</Label>
            <Input id="project-budget" name="estimatedBudget" type="number" min={0} step="0.01" />
          </div>
          <DialogFooter>
            <Button type="submit" loading={isPending} size="sm">
              {isPending ? tCommon('loading') : t('addProject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

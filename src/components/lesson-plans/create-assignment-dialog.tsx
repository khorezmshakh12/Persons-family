'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createAssignmentAction, type HomeworkActionState } from '@/lib/actions/homework';
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

export function CreateAssignmentDialog({ groupId }: { groupId: string }) {
  const t = useTranslations('lessonPlans');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<HomeworkActionState, FormData>(
    createAssignmentAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="border-white/30 bg-white/10 text-white hover:bg-white/20" />}>
        <Plus className="size-4" />
        {t('homework.addAssignment')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('homework.addAssignment')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="groupId" value={groupId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t('homework.assignmentTitle')}</Label>
            <Input id="title" name="title" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">{t('homework.assignmentDescription')}</Label>
            <Textarea id="description" name="description" maxLength={2000} rows={3} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dueDate">{t('homework.dueDate')}</Label>
            <Input id="dueDate" name="dueDate" type="date" />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

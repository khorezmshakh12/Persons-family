'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';
import { createStudentAction, type HomeworkActionState } from '@/lib/actions/homework';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function CreateStudentDialog({
  groupId,
  onOptimisticAdd,
}: {
  groupId: string;
  onOptimisticAdd: (fullName: string) => void;
}) {
  const t = useTranslations('lessonPlans');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);

  async function composedAction(prevState: HomeworkActionState, formData: FormData) {
    const fullName = formData.get('fullName');
    if (typeof fullName === 'string' && fullName.trim()) {
      onOptimisticAdd(fullName);
      // Close immediately — the dialog is a modal overlay, so unlike chat/
      // comments the optimistic list update behind it would otherwise stay
      // invisible until the real request resolves.
      setOpen(false);
    }
    return createStudentAction(prevState, formData);
  }

  const [state, formAction, isPending] = useActionState<HomeworkActionState, FormData>(
    composedAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) toast.error(t(`errors.${state.error}`));
  }, [state, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="text-white/70 hover:text-white" />}>
        <UserPlus className="size-4" />
        {t('homework.addStudent')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('homework.addStudent')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="groupId" value={groupId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">{t('homework.studentName')}</Label>
            <Input id="fullName" name="fullName" required maxLength={200} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isPending ? tCommon('loading') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

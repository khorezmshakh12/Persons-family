'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { updateLessonPlanDayAction, type LessonPlanActionState } from '@/lib/actions/lesson-plans';
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

export function EditDayDialog({
  dayId,
  weekdayLabel,
  topic,
  notes,
}: {
  dayId: string;
  weekdayLabel: string;
  topic: string | null;
  notes: string | null;
}) {
  const t = useTranslations('lessonPlans');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<LessonPlanActionState, FormData>(
    updateLessonPlanDayAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-white/60 hover:text-white" />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{weekdayLabel}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="dayId" value={dayId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`topic-${dayId}`}>{t('dayTopic')}</Label>
            <Input id={`topic-${dayId}`} name="topic" maxLength={300} defaultValue={topic ?? ''} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`notes-${dayId}`}>{t('dayNotes')}</Label>
            <Textarea id={`notes-${dayId}`} name="notes" maxLength={2000} rows={3} defaultValue={notes ?? ''} />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRightLeft } from 'lucide-react';
import { moveLessonPlanAction, type LessonActionState } from '@/lib/actions/course-lessons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

export function MoveLessonDialog({ lessonId, lessonDate }: { lessonId: string; lessonDate: string | null }) {
  const t = useTranslations('lessonPlans');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<LessonActionState, FormData>(moveLessonPlanAction, undefined);

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="tap-scale h-7 w-7 shrink-0 p-0 text-white/50 hover:text-white"
            aria-label={t('courseLessons.move')}
          />
        }
      >
        <ArrowRightLeft className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('courseLessons.moveDialogTitle')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="lessonId" value={lessonId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetDate">{t('courseLessons.moveTargetDate')}</Label>
            <Input id="targetDate" name="targetDate" type="date" required defaultValue={lessonDate ?? ''} className="[color-scheme:dark]" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">{t('courseLessons.moveReason')}</Label>
            <Textarea
              id="reason"
              name="reason"
              required
              minLength={5}
              maxLength={1000}
              rows={3}
              placeholder={t('courseLessons.moveReasonPlaceholder')}
            />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`, state.errorParams)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('courseLessons.moveSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

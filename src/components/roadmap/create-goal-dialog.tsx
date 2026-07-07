'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createGoalAction, type RoadmapActionState } from '@/lib/actions/roadmap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function CreateGoalDialog() {
  const t = useTranslations('roadmap');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<RoadmapActionState, FormData>(createGoalAction, undefined);

  useEffect(() => {
    if (state?.success) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t('newGoal')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newGoal')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t('goalTitle')}</Label>
            <Input id="title" name="title" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="timeframe">{t('timeframe.label')}</Label>
            <Select name="timeframe" defaultValue="weekly">
              <SelectTrigger id="timeframe" className="w-full">
                <SelectValue>{(value: string) => t(`timeframe.${value}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">{t('timeframe.weekly')}</SelectItem>
                <SelectItem value="monthly">{t('timeframe.monthly')}</SelectItem>
                <SelectItem value="quarterly">{t('timeframe.quarterly')}</SelectItem>
              </SelectContent>
            </Select>
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

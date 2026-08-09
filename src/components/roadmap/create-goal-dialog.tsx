'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { createRoadmapGoalAction, type RoadmapActionState } from '@/lib/actions/roadmap';
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

const FIELD =
  'h-9 w-full rounded-lg border border-white/25 bg-white/5 px-3 text-sm text-white outline-none transition-colors focus-visible:border-white/70';

export function CreateGoalDialog({ timeframe }: { timeframe: 'weekly' | 'monthly' | 'quarterly' }) {
  const t = useTranslations('roadmap');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<RoadmapActionState, FormData>(
    createRoadmapGoalAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    } else if (state && !state.error) {
      toast.success(t('goalAdded'));
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
        {t('addGoal')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`addGoalTo.${timeframe}`)}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="timeframe" value={timeframe} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`goal-title-${timeframe}`}>{t('goalTitle')}</Label>
            <Input id={`goal-title-${timeframe}`} name="title" placeholder={t('goalTitlePlaceholder')} required />
          </div>
          <DialogFooter>
            <Button type="submit" loading={isPending} size="sm">
              {isPending ? tCommon('loading') : t('addGoal')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { FIELD as ROADMAP_FIELD_CLASS };

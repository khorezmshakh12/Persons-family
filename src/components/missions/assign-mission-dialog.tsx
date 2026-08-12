'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { assignMissionAction, type MissionActionState } from '@/lib/actions/missions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DateInput } from '@/components/ui/date-input';
import { CurrencyInput } from '@/components/staff/currency-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function AssignMissionDialog({ staffId }: { staffId: string }) {
  const t = useTranslations('missions');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<MissionActionState, FormData>(
    assignMissionAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    } else if (state && !state.error) {
      toast.success(t('missionAssigned'));
      setOpen(false);
    }
  }, [state, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-fit border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <Plus className="size-4" />
        {t('assign')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assign')}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`mtitle-${staffId}`}>{t('missionTitle')}</Label>
            <Input id={`mtitle-${staffId}`} name="title" placeholder={t('missionTitlePlaceholder')} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`mdesc-${staffId}`}>{t('description')}</Label>
            <Textarea id={`mdesc-${staffId}`} name="description" placeholder={t('descriptionPlaceholder')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`mdeadline-${staffId}`}>{t('deadline')}</Label>
            <DateInput id={`mdeadline-${staffId}`} name="deadlineDate" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`mbonus-${staffId}`}>{t('bonusAmount')}</Label>
            <CurrencyInput id={`mbonus-${staffId}`} name="bonusAmount" defaultValue={0} />
          </div>
          <DialogFooter>
            <Button type="submit" loading={isPending} size="sm">
              {isPending ? tCommon('loading') : t('assign')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

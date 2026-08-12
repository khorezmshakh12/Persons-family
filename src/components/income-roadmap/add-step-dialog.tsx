'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { addIncomeStepAction, type IncomeRoadmapActionState } from '@/lib/actions/income-roadmap';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/staff/currency-input';
import { DateInput } from '@/components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function AddStepDialog({ staffId, planId }: { staffId: string; planId: string }) {
  const t = useTranslations('incomeRoadmap');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<IncomeRoadmapActionState, FormData>(
    addIncomeStepAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    } else if (state && !state.error) {
      toast.success(t('stepAdded'));
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
        {t('addStep')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addStep')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="planId" value={planId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`step-amount-${planId}`}>{t('targetAmount')}</Label>
            <CurrencyInput id={`step-amount-${planId}`} name="targetAmount" defaultValue={0} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`step-month-${planId}`}>{t('targetMonth')}</Label>
            <DateInput id={`step-month-${planId}`} name="targetMonth" showDay={false} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`step-benefit-${planId}`}>{t('benefitDescription')}</Label>
            <Textarea id={`step-benefit-${planId}`} name="benefitDescription" placeholder={t('benefitDescriptionPlaceholder')} required />
          </div>
          <DialogFooter>
            <Button type="submit" loading={isPending} size="sm">
              {isPending ? tCommon('loading') : t('addStep')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

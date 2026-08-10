'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { upsertIncomePlanAction, type IncomeRoadmapActionState } from '@/lib/actions/income-roadmap';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/staff/currency-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

type Plan = { year: number; base_monthly_income: number; target_year_end_income: number };

export function IncomePlanDialog({ staffId, plan }: { staffId: string; plan?: Plan }) {
  const t = useTranslations('incomeRoadmap');
  const tCommon = useTranslations('common');
  const isEdit = Boolean(plan);
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<IncomeRoadmapActionState, FormData>(
    upsertIncomePlanAction,
    undefined,
  );
  const year = plan?.year ?? new Date().getFullYear();

  useEffect(() => {
    if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    } else if (state && !state.error) {
      toast.success(t('planSaved'));
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
        {isEdit ? t('editPlan') : t('createPlan')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editPlan') : t('createPlan')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="year" value={year} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`base-income-${staffId}`}>{t('baseMonthlyIncome')}</Label>
            <CurrencyInput id={`base-income-${staffId}`} name="baseMonthlyIncome" defaultValue={plan?.base_monthly_income ?? 0} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`target-income-${staffId}`}>{t('targetYearEndIncome')}</Label>
            <CurrencyInput
              id={`target-income-${staffId}`}
              name="targetYearEndIncome"
              defaultValue={plan?.target_year_end_income ?? 0}
            />
          </div>
          <DialogFooter>
            <Button type="submit" loading={isPending} size="sm">
              {isPending ? tCommon('loading') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

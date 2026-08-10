'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';
import { addKpiMetricAction, updateKpiMetricAction, type KpiActionState } from '@/lib/actions/kpi';
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

type Metric = { id: string; name: string; weight_percentage: number };

/** Add mode when `metric` is omitted, edit mode when it's passed — same
 * form either way, only the bound action and trigger button differ. Mirrors
 * how roadmap's GoalCard folds its whole edit form into one component
 * rather than splitting add/edit into separate dialogs. */
export function ManageMetricDialog({ staffId, metric }: { staffId: string; metric?: Metric }) {
  const t = useTranslations('kpi');
  const tCommon = useTranslations('common');
  const isEdit = Boolean(metric);
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<KpiActionState, FormData>(
    isEdit ? updateKpiMetricAction : addKpiMetricAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    } else if (state && !state.error) {
      toast.success(t(isEdit ? 'metricUpdated' : 'metricAdded'));
      setOpen(false);
    }
  }, [state, t, isEdit]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('editMetric')}
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
            />
          ) : (
            <Button variant="outline" size="sm" className="w-fit border-white/30 bg-white/10 text-white hover:bg-white/20" />
          )
        }
      >
        {isEdit ? <Pencil className="size-3.5" /> : (
          <>
            <Plus className="size-4" />
            {t('addMetric')}
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editMetric') : t('addMetric')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          {isEdit && <input type="hidden" name="metricId" value={metric!.id} />}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`metric-name-${staffId}-${metric?.id ?? 'new'}`}>{t('metricName')}</Label>
            <Input
              id={`metric-name-${staffId}-${metric?.id ?? 'new'}`}
              name="name"
              placeholder={t('metricNamePlaceholder')}
              defaultValue={metric?.name}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`metric-weight-${staffId}-${metric?.id ?? 'new'}`}>{t('weight')}</Label>
            <Input
              id={`metric-weight-${staffId}-${metric?.id ?? 'new'}`}
              name="weightPercentage"
              type="number"
              min={1}
              max={100}
              defaultValue={metric?.weight_percentage}
              required
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

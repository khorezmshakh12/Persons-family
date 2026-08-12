'use client';

import { useActionState, useEffect, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { upsertKpiEntryAction, deleteKpiMetricAction, type KpiActionState } from '@/lib/actions/kpi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ManageMetricDialog } from './manage-metric-dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

const FIELD =
  'w-24 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-sm text-white outline-none transition-colors focus-visible:border-white/70';

export type Metric = { id: string; name: string; weight_percentage: number };
export type MetricEntry = { target_value: number; actual_value: number | null };

export function MetricRow({
  staffId,
  month,
  metric,
  entry,
  canManage,
}: {
  staffId: string;
  month: string;
  metric: Metric;
  entry: MetricEntry | null;
  canManage: boolean;
}) {
  const t = useTranslations('kpi');
  const tCommon = useTranslations('common');
  const [state, formAction, isPending] = useActionState<KpiActionState, FormData>(upsertKpiEntryAction, undefined);
  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (state?.error) toast.error(t(`errors.${state.error}`));
    else if (state && !state.error) toast.success(t('entrySaved'));
  }, [state, t]);

  const achievement =
    entry && entry.actual_value != null && entry.target_value !== 0
      ? Math.round((entry.actual_value / entry.target_value) * 100)
      : null;

  function handleDelete() {
    startDelete(async () => {
      const formData = new FormData();
      formData.set('metricId', metric.id);
      formData.set('staffId', staffId);
      const result = await deleteKpiMetricAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="font-medium text-white">{metric.name}</span>
        <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/70">
          {metric.weight_percentage}%
        </span>
        {achievement != null && (
          <Badge variant="tint" tint={achievement >= 100 ? 'green' : 'red'} className="shrink-0">
            {achievement}%
          </Badge>
        )}
      </div>

      {canManage ? (
        <form action={formAction} className="flex shrink-0 items-center gap-2">
          <input type="hidden" name="metricId" value={metric.id} />
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="month" value={month} />
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-white/50">{t('target')}</label>
            <input type="number" name="targetValue" step="0.01" defaultValue={entry?.target_value} className={FIELD} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-white/50">{t('actual')}</label>
            <input type="number" name="actualValue" step="0.01" defaultValue={entry?.actual_value ?? undefined} className={FIELD} />
          </div>
          <Button type="submit" size="sm" loading={isPending} className="self-end">
            {t('save')}
          </Button>
          <ManageMetricDialog staffId={staffId} metric={metric} />
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('deleteMetric')}
                  className="self-end border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                />
              }
            >
              <Trash2 className="size-3.5" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('confirmDeleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('confirmDeleteDescription', { name: metric.name })}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {t('confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </form>
      ) : (
        <div className="flex shrink-0 items-center gap-4 text-sm text-white/70">
          <span>
            {t('target')}: {entry?.target_value ?? '—'}
          </span>
          <span>
            {t('actual')}: {entry?.actual_value ?? '—'}
          </span>
        </div>
      )}
    </div>
  );
}

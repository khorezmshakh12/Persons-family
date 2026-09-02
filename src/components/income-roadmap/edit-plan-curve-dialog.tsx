'use client';

import { useActionState, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Sliders, Sparkles, Equal } from 'lucide-react';
import {
  saveMonthlyPlanAction,
  type IncomeRoadmapActionState,
} from '@/lib/actions/income-roadmap';
import type { IncomeRoadmapMonth } from './data';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatUZS } from '@/lib/format-currency';

export function EditPlanCurveDialog({
  staffId,
  roadmapId,
  months,
  baselineMonthlyIncome,
  targetYearEndIncome,
}: {
  staffId: string;
  roadmapId: string;
  months: IncomeRoadmapMonth[];
  baselineMonthlyIncome: number;
  targetYearEndIncome: number;
}) {
  const t = useTranslations('incomeRoadmap');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [open, setOpen] = useState(false);

  // 12 monthly values in local state for the convenience fill tools
  const [values, setValues] = useState<number[]>(() =>
    months.map((m) => m.planned),
  );

  const [state, formAction, isPending] = useActionState<IncomeRoadmapActionState, FormData>(
    async (prev, formData) => {
      const result = await saveMonthlyPlanAction(prev, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        toast.success(t('planCurveSaved'));
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      setValues(months.map((m) => m.planned));
    }
    setOpen(isOpen);
  }

  function handleValueChange(monthIndex: number, raw: string) {
    const digits = Number(raw.replace(/[^\d]/g, '')) || 0;
    setValues((prev) => {
      const copy = [...prev];
      copy[monthIndex] = digits;
      return copy;
    });
  }

  // Flat tool: fill all 12 with baseline or custom
  function handleFillFlat() {
    const val = baselineMonthlyIncome || values[0] || 0;
    setValues(Array(12).fill(val));
  }

  // Ramp tool: linear interpolation from Jan (baseline) to Dec (target)
  function handleFillRamp() {
    const start = baselineMonthlyIncome || values[0] || 0;
    const end = targetYearEndIncome || values[11] || start;
    const ramped = Array.from({ length: 12 }, (_, i) => {
      return Math.round(start + ((end - start) * i) / 11);
    });
    setValues(ramped);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/15"
          >
            <Sliders className="size-3.5" />
            {t('editPlanCurve')}
          </Button>
        }
      />
      <DialogContent className="border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">{t('editPlanCurve')}</DialogTitle>
        </DialogHeader>

        {/* Quick fill convenience toolbar */}
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-white/15 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleFillFlat}
              className="gap-1 border-white/20 bg-white/10 text-xs text-white hover:bg-white/20"
            >
              <Equal className="size-3" />
              {t('fillFlat')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleFillRamp}
              className="gap-1 border-white/20 bg-white/10 text-xs text-white hover:bg-white/20"
            >
              <Sparkles className="size-3 text-emerald-300" />
              {t('fillRamp')}
            </Button>
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="roadmapId" value={roadmapId} />

          {/* 12-month grid: 3 or 4 columns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {months.map((m, idx) => {
              const date = new Date(`${m.monthKey}-01T00:00:00Z`);
              const monthName = format.dateTime(date, { month: 'short' });
              const val = values[idx] ?? 0;

              return (
                <div
                  key={m.monthNumber}
                  className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 p-2.5"
                >
                  <Label htmlFor={`plan-${m.monthNumber}`} className="text-xs text-white/70">
                    {monthName}
                  </Label>
                  <Input
                    id={`plan-${m.monthNumber}`}
                    inputMode="numeric"
                    value={val ? formatUZS(val) : ''}
                    placeholder="0"
                    onChange={(e) => handleValueChange(idx, e.target.value)}
                    className="border-white/20 bg-white/10 text-white text-xs tabular-nums h-8"
                  />
                  <input type="hidden" name={`planned-${m.monthNumber}`} value={val} />
                </div>
              );
            })}
          </div>

          {state?.error && (
            <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-white/20 text-white hover:bg-white/10"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {isPending ? tCommon('loading') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

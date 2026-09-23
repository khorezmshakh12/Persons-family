'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';
import {
  upsertIncomeRoadmapAction,
  type IncomeRoadmapActionState,
} from '@/lib/actions/income-roadmap';
import type { IncomeRoadmapHeader } from './data';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CurrencyInput } from '@/components/staff/currency-input';

export function UpsertRoadmapDialog({
  staffId,
  year,
  roadmap,
  trigger,
}: {
  staffId: string;
  year: number;
  roadmap?: IncomeRoadmapHeader | null;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations('incomeRoadmap');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>(roadmap?.status ?? 'active');

  const [state, formAction, isPending] = useActionState<IncomeRoadmapActionState, FormData>(
    async (prev, formData) => {
      const result = await upsertIncomeRoadmapAction(prev, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        toast.success(t('planSaved'));
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  const isEdit = Boolean(roadmap);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : isEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-au-line bg-au-card-2 text-au-ink hover:bg-au-card-2"
            >
              <Pencil className="size-3.5" />
              {t('editPlan')}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-au-primary hover:bg-black text-white font-medium shadow-sm"
            >
              <Plus className="size-4" />
              {t('createPlan')}
            </Button>
          )
        }
      />
      <DialogContent className="border-au-line bg-au-card text-au-ink sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-au-ink">
            {isEdit ? t('editPlan') : t('createPlan')} · {year}
          </DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="status" value={status} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="roadmap-year">{t('year')}</Label>
            <Input
              id="roadmap-year"
              disabled
              value={year}
              className="border-au-line bg-au-card-2 text-au-ink"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="baselineMonthlyIncome">{t('baselineMonthlyIncome')}</Label>
              <CurrencyInput
                id="baselineMonthlyIncome"
                name="baselineMonthlyIncome"
                defaultValue={roadmap?.baselineMonthlyIncome ?? 0}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="targetYearEndIncome">{t('targetYearEndIncome')}</Label>
              <CurrencyInput
                id="targetYearEndIncome"
                name="targetYearEndIncome"
                defaultValue={roadmap?.targetYearEndIncome ?? 0}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('statusLabel')}</Label>
            <Select
              value={status}
              onValueChange={(val) => {
                if (val) setStatus(val);
              }}
            >
              <SelectTrigger className="border-au-line bg-au-card text-au-ink">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-au-line bg-au-card text-au-ink">
                <SelectItem value="active">{t('status.active')}</SelectItem>
                <SelectItem value="draft">{t('status.draft')}</SelectItem>
                <SelectItem value="archived">{t('status.archived')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="roadmap-notes">{t('notes')}</Label>
            <Textarea
              id="roadmap-notes"
              name="notes"
              defaultValue={roadmap?.notes ?? ''}
              maxLength={4000}
              rows={3}
              placeholder={t('notes')}
              className="border-au-line bg-au-card text-au-ink placeholder:text-au-faint"
            />
          </div>

          {state?.error && (
            <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-au-line text-au-ink hover:bg-au-card-2"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-au-primary hover:bg-black text-white font-medium"
            >
              {isPending ? tCommon('loading') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

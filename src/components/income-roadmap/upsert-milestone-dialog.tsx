'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';
import {
  createMilestoneAction,
  updateMilestoneAction,
  type IncomeRoadmapActionState,
} from '@/lib/actions/income-roadmap';
import type { IncomeRoadmapMilestone } from './data';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

export function UpsertMilestoneDialog({
  staffId,
  roadmapId,
  milestone,
  trigger,
}: {
  staffId: string;
  roadmapId: string;
  milestone?: IncomeRoadmapMilestone;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations('incomeRoadmap');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [targetMonth, setTargetMonth] = useState<string>(
    String(milestone?.targetMonth ?? 6),
  );

  const isEdit = Boolean(milestone);

  const [state, formAction, isPending] = useActionState<IncomeRoadmapActionState, FormData>(
    async (prev, formData) => {
      const action = isEdit ? updateMilestoneAction : createMilestoneAction;
      const result = await action(prev, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        toast.success(isEdit ? t('milestoneSaved') : t('milestoneAdded'));
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : isEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('editMilestone')}
              className="text-au-muted hover:text-au-ink hover:bg-au-card-2"
            >
              <Pencil className="size-3" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-au-primary hover:bg-black text-white font-medium shadow-sm"
            >
              <Plus className="size-4" />
              {t('addMilestone')}
            </Button>
          )
        }
      />
      <DialogContent className="border-au-line bg-au-card text-au-ink sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-au-ink">
            {isEdit ? t('editMilestone') : t('addMilestone')}
          </DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          {isEdit && milestone ? (
            <input type="hidden" name="milestoneId" value={milestone.id} />
          ) : (
            <input type="hidden" name="roadmapId" value={roadmapId} />
          )}
          <input type="hidden" name="targetMonth" value={targetMonth} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="milestone-title">{t('milestoneTitle')}</Label>
            <Input
              id="milestone-title"
              name="title"
              required
              defaultValue={milestone?.title ?? ''}
              maxLength={160}
              placeholder="e.g. 5 ta yangi guruh ochish"
              className="border-au-line bg-au-card text-au-ink"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>{t('targetMonth')}</Label>
              <Select
                value={targetMonth}
                onValueChange={(val) => {
                  if (val) setTargetMonth(val);
                }}
              >
                <SelectTrigger className="border-au-line bg-au-card text-au-ink">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-au-line bg-au-card text-au-ink max-h-48">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {t('month')} {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="milestone-targetIncome">{t('targetIncome')}</Label>
              <CurrencyInput
                id="milestone-targetIncome"
                name="targetIncome"
                defaultValue={milestone?.targetIncome ?? 0}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="milestone-criteria">{t('criteria')}</Label>
            <Textarea
              id="milestone-criteria"
              name="criteria"
              defaultValue={milestone?.criteria ?? ''}
              maxLength={2000}
              rows={3}
              placeholder={t('criteriaPlaceholder')}
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

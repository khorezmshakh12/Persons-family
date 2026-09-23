'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import {
  deleteIncomeRoadmapAction,
  type IncomeRoadmapActionState,
} from '@/lib/actions/income-roadmap';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function DeleteRoadmapDialog({
  staffId,
  roadmapId,
  year,
}: {
  staffId: string;
  roadmapId: string;
  year: number;
}) {
  const t = useTranslations('incomeRoadmap');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);

  const [state, formAction, isPending] = useActionState<IncomeRoadmapActionState, FormData>(
    async (prev, formData) => {
      const result = await deleteIncomeRoadmapAction(prev, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        toast.success(t('planDeleted'));
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1.5 border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20"
          >
            <Trash2 className="size-3.5" />
            {t('deletePlan')}
          </Button>
        }
      />
      <AlertDialogContent className="border-au-line bg-au-card text-au-ink sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-au-ink">
            {t('confirmDeletePlanTitle')} ({year})
          </AlertDialogTitle>
          <AlertDialogDescription className="text-au-muted">
            {t('confirmDeletePlanDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state?.error && (
          <p className="text-destructive text-sm px-4">{t(`errors.${state.error}`)}</p>
        )}

        <form action={formAction}>
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="roadmapId" value={roadmapId} />

          <AlertDialogFooter className="border-t-0 bg-transparent p-0 gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel
              variant="outline"
              className="border-au-line text-au-ink hover:bg-au-card-2"
            >
              {tCommon('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              disabled={isPending}
              variant="destructive"
              className="bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              {isPending ? tCommon('loading') : t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

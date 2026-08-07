'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { addFinanceEntryAction, type FinanceActionState } from '@/lib/actions/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function ManageStaffFinanceDialog({ staffId }: { staffId: string }) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<FinanceActionState, FormData>(
    addFinanceEntryAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    } else if (state && !state.error) {
      toast.success(t('entryAdded'));
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
        {t('addEntry')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addEntry')}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`title-${staffId}`}>{t('entryTitle')}</Label>
            <Input id={`title-${staffId}`} name="title" placeholder={t('entryTitlePlaceholder')} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`amount-${staffId}`}>{t('amount')}</Label>
            <Input id={`amount-${staffId}`} name="amount" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`note-${staffId}`}>{t('note')}</Label>
            <Textarea id={`note-${staffId}`} name="note" placeholder={t('notePlaceholder')} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? tCommon('loading') : t('addEntry')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

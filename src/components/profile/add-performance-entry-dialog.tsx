'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CircleDollarSign } from 'lucide-react';
import { addPerformanceEntryAction, type PerformanceActionState } from '@/lib/actions/performance';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** CEO-only. A focused extraction of ManageStaffPerformanceDialog's entry
 * form (same addPerformanceEntryAction) without its Tier section, which
 * belongs to /self-development, not this page. */
export function AddPerformanceEntryDialog({ staffId }: { staffId: string }) {
  const t = useTranslations('performance');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<PerformanceActionState, FormData>(
    addPerformanceEntryAction,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if (state.error) toast.error(t(`errors.${state.error}`));
    else {
      toast.success(t('entryAdded'));
      setOpen(false);
    }
  }, [state, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <CircleDollarSign className="size-4" />
        {t('addEntry')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addEntry')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="entryType">{t('entryType')}</Label>
              <Select name="entryType" defaultValue="bonus">
                <SelectTrigger id="entryType" className="w-full">
                  <SelectValue>
                    {(value: string) => t(value === 'bonus' ? 'bonus' : 'penalty')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonus">{t('bonus')}</SelectItem>
                  <SelectItem value="penalty">{t('penalty')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">{t('amount')}</Label>
              <Input id="amount" name="amount" type="number" min={1} step="0.01" required />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">{t('reason')}</Label>
            <Textarea id="reason" name="reason" placeholder={t('reasonPlaceholder')} />
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

'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import { updateStaffTierAction, addPerformanceEntryAction, type PerformanceActionState } from '@/lib/actions/performance';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Database } from '@/lib/supabase/types';

type StaffPerformance = Database['public']['Tables']['staff_performance']['Row'];

export function ManageStaffPerformanceDialog({
  staffId,
  performance,
}: {
  staffId: string;
  performance: StaffPerformance | null;
}) {
  const t = useTranslations('performance');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [tierState, tierFormAction, isTierPending] = useActionState<PerformanceActionState, FormData>(
    updateStaffTierAction,
    undefined,
  );
  const [entryState, entryFormAction, isEntryPending] = useActionState<PerformanceActionState, FormData>(
    addPerformanceEntryAction,
    undefined,
  );

  useEffect(() => {
    if (tierState?.error) toast.error(t(`errors.${tierState.error}`));
  }, [tierState, t]);

  useEffect(() => {
    if (entryState?.error) toast.error(t(`errors.${entryState.error}`));
    else if (entryState && !entryState.error) toast.success(t('entryAdded'));
  }, [entryState, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="border-white/30 bg-white/10 text-white hover:bg-white/20 w-fit" />}
      >
        <Settings2 className="size-4" />
        {t('manage')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('manage')}</DialogTitle>
        </DialogHeader>

        <form action={tierFormAction} className="flex flex-col gap-4 border-b border-white/10 pb-4">
          <input type="hidden" name="staffId" value={staffId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`tier-${staffId}`}>{t('tier')}</Label>
            <Select name="currentTier" defaultValue={performance?.current_tier ?? 'C'}>
              <SelectTrigger id={`tier-${staffId}`} className="w-full">
                <SelectValue>{(value: string) => t(`tierLabels.${value}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(['A', 'B', 'C'] as const).map((tier) => (
                  <SelectItem key={tier} value={tier}>
                    {t(`tierLabels.${tier}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`months-${staffId}`}>{t('monthsInTier')}</Label>
              <Input
                id={`months-${staffId}`}
                name="monthsInTier"
                type="number"
                min={0}
                max={6}
                defaultValue={performance?.months_in_tier ?? 0}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`score-${staffId}`}>{t('weeklyProgressScore')}</Label>
              <Input
                id={`score-${staffId}`}
                name="weeklyProgressScore"
                type="number"
                min={0}
                max={100}
                defaultValue={performance?.weekly_progress_score ?? 0}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`notes-${staffId}`}>{t('notes')}</Label>
            <Textarea
              id={`notes-${staffId}`}
              name="notes"
              defaultValue={performance?.notes ?? ''}
              placeholder={t('notesPlaceholder')}
            />
          </div>
          <Button type="submit" disabled={isTierPending} size="sm">
            {isTierPending ? tCommon('loading') : t('saveTier')}
          </Button>
        </form>

        <form action={entryFormAction} className="flex flex-col gap-4 pt-2">
          <input type="hidden" name="staffId" value={staffId} />
          <h3 className="text-sm font-medium text-white">{t('addEntry')}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`entryType-${staffId}`}>{t('entryType')}</Label>
              <Select name="entryType" defaultValue="bonus">
                <SelectTrigger id={`entryType-${staffId}`} className="w-full">
                  <SelectValue>{(value: string) => t(value === 'bonus' ? 'bonus' : 'penalty')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonus">{t('bonus')}</SelectItem>
                  <SelectItem value="penalty">{t('penalty')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`amount-${staffId}`}>{t('amount')}</Label>
              <Input id={`amount-${staffId}`} name="amount" type="number" min={1} step="0.01" required />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`reason-${staffId}`}>{t('reason')}</Label>
            <Textarea id={`reason-${staffId}`} name="reason" placeholder={t('reasonPlaceholder')} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isEntryPending} size="sm">
              {isEntryPending ? tCommon('loading') : t('addEntry')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

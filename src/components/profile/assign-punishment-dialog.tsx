'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Gavel } from 'lucide-react';
import { assignPunishmentAction, type WarningActionState } from '@/lib/actions/warnings';
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

export function AssignPunishmentDialog({
  staffId,
  warningId,
}: {
  staffId: string;
  warningId: string;
}) {
  const t = useTranslations('profile.warnings');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<WarningActionState, FormData>(
    assignPunishmentAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
          />
        }
      >
        <Gavel className="size-3.5" />
        {t('assignPunishment')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assignPunishment')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="warningId" value={warningId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`amount-${warningId}`}>{t('amount')}</Label>
            <Input
              id={`amount-${warningId}`}
              name="amount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={0}
              required
            />
            <p className="text-xs text-white/50">{t('amountHint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`punishmentReason-${warningId}`}>{t('punishmentReason')}</Label>
            <Textarea id={`punishmentReason-${warningId}`} name="reason" maxLength={500} rows={3} />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="bg-red-600 hover:bg-red-700">
              {isPending ? tCommon('loading') : t('assignPunishment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

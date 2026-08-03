'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createContractRequestAction, type ContractActionState } from '@/lib/actions/contracts';
import { Button } from '@/components/ui/button';
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

export function RequestContractActionDialog({
  contractId,
  requestType,
}: {
  contractId: string;
  requestType: 'freeze' | 'extend';
}) {
  const t = useTranslations('profile.contracts');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ContractActionState, FormData>(
    createContractRequestAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  const label = t(requestType === 'freeze' ? 'requestFreeze' : 'requestExtend');

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
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="contractId" value={contractId} />
          <input type="hidden" name="requestType" value={requestType} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`reqReason-${contractId}-${requestType}`}>{t('requestReason')}</Label>
            <Textarea
              id={`reqReason-${contractId}-${requestType}`}
              name="reason"
              maxLength={1000}
              rows={3}
            />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('submitRequest')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

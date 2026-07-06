'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound } from 'lucide-react';
import { resetStaffPasswordAction, type StaffActionState } from '@/lib/actions/staff';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TempPasswordResult } from './temp-password-result';

export function ResetPasswordDialog({ staffId }: { staffId: string }) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<StaffActionState, FormData>(
    resetStaffPasswordAction,
    undefined,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="border-white/30 bg-white/10 text-white hover:bg-white/20" />}
      >
        <KeyRound className="size-4" />
        {t('resetPassword')}
      </DialogTrigger>
      <DialogContent>
        {state?.tempPassword ? (
          <TempPasswordResult tempPassword={state.tempPassword} onDone={() => setOpen(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('confirmResetPasswordTitle')}</DialogTitle>
              <DialogDescription>{t('confirmResetPasswordDescription')}</DialogDescription>
            </DialogHeader>
            {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
            <form action={formAction}>
              <input type="hidden" name="id" value={staffId} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {tCommon('cancel')}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? tCommon('loading') : t('confirm')}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toggleStaffActiveAction, type StaffActionState } from '@/lib/actions/staff';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export function ToggleActiveButton({ staffId, isActive }: { staffId: string; isActive: boolean }) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<StaffActionState, FormData>(
    toggleStaffActiveAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant={isActive ? 'outline' : 'default'} size="sm" />}>
        {isActive ? t('deactivate') : t('activate')}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isActive ? t('confirmDeactivateTitle') : t('confirmActivateTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isActive ? t('confirmDeactivateDescription') : t('confirmActivateDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
        <form action={formAction}>
          <input type="hidden" name="id" value={staffId} />
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

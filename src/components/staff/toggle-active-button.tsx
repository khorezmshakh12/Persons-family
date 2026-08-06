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

export function ToggleActiveButton({
  staffId,
  isActive,
  open: openProp,
  onOpenChange,
}: {
  staffId: string;
  isActive: boolean;
  /** When provided, this dialog is externally controlled (e.g. opened from
   * a DropdownMenuItem in StaffRowActions) and renders no trigger of its
   * own — the caller owns showing/hiding it. Omit both to get the default
   * self-contained button + dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;
  const [state, formAction, isPending] = useActionState<StaffActionState, FormData>(
    toggleStaffActiveAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state, setOpen]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <AlertDialogTrigger
          render={
            <Button
              variant={isActive ? 'outline' : 'default'}
              size="sm"
              className={
                isActive ? 'border-white/30 bg-white/10 text-white hover:bg-white/20' : undefined
              }
            />
          }
        >
          {isActive ? t('deactivate') : t('activate')}
        </AlertDialogTrigger>
      )}
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

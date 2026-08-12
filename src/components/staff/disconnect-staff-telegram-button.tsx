'use client';

import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { adminDisconnectTelegramAction } from '@/lib/actions/telegram';
import type { TelegramActionState } from '@/lib/actions/telegram';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

/** CEO-only, opened from a DropdownMenuItem in StaffRowActions — same
 * externally-controlled shape as ToggleActiveButton/DeleteStaffButton. An
 * employee can no longer unlink their own Telegram (see Settings); this is
 * the only place it can be done now. */
export function DisconnectStaffTelegramButton({
  staffId,
  open,
  onOpenChange,
}: {
  staffId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [state, formAction, isPending] = useActionState<TelegramActionState, FormData>(
    adminDisconnectTelegramAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) {
      toast.success(t('telegramDisconnected'));
      onOpenChange(false);
    } else if (state?.error) {
      toast.error(t(`errors.${state.error}`));
    }
  }, [state, t, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmDisconnectTelegramTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('confirmDisconnectTelegramDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
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

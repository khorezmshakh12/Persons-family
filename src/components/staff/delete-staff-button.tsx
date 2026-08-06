'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteStaffAction } from '@/lib/actions/staff';
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

export function DeleteStaffButton({
  staffId,
  staffName,
  open,
  onOpenChange,
}: {
  staffId: string;
  staffName: string;
  /** When provided, this dialog is externally controlled (e.g. opened from
   * a DropdownMenuItem in StaffRowActions) and renders no trigger of its
   * own — the caller owns showing/hiding it. Omit both to get the default
   * self-contained icon button + dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const isControlled = open !== undefined;

  function handleDelete() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('id', staffId);
      const result = await deleteStaffAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <AlertDialog {...(isControlled ? { open, onOpenChange } : {})}>
      {!isControlled && (
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t('delete')}
              className="border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
            />
          }
        >
          <Trash2 className="size-3.5" />
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmDeleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('confirmDeleteDescription', { name: staffName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={isPending}
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

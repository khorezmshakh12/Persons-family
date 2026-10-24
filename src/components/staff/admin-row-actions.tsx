'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Power, Trash2 } from 'lucide-react';
import { deleteAdminAction, toggleAdminActiveAction } from '@/lib/actions/admin-management';
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

export function AdminRowActions({
  adminId,
  adminName,
  isActive,
}: {
  adminId: string;
  adminName: string;
  isActive: boolean;
}) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [isTogglePending, startToggleTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();

  function idFormData() {
    const formData = new FormData();
    formData.set('id', adminId);
    return formData;
  }

  function handleToggleActive() {
    startToggleTransition(async () => {
      const result = await toggleAdminActiveAction(undefined, idFormData());
      if (result?.error) toast.error(t(`adminManagement.errors.${result.error}`));
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteAdminAction(undefined, idFormData());
      if (result?.error) toast.error(t(`adminManagement.errors.${result.error}`));
      else if (result?.archived) toast.info(t('deletedArchived'));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleToggleActive}
        disabled={isTogglePending}
        className="border-au-line bg-au-card text-au-ink hover:bg-au-card-2"
      >
        {isTogglePending ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
        {isActive ? t('adminManagement.suspend') : t('adminManagement.activate')}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-red-400/30 bg-red-500/10 text-red-700 hover:bg-red-500/20"
            />
          }
        >
          <Trash2 className="size-4" />
          {t('adminManagement.delete')}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('adminManagement.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('adminManagement.confirmDeleteDescription', { name: adminName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={isDeletePending}
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletePending ? tCommon('loading') : t('adminManagement.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

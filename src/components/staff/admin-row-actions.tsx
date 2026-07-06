'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Crown, Loader2, Power, Trash2 } from 'lucide-react';
import { deleteAdminAction, toggleAdminActiveAction, transferCeoRoleAction } from '@/lib/actions/admin-management';
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
  const [isTransferPending, startTransferTransition] = useTransition();

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
    });
  }

  function handleTransfer() {
    startTransferTransition(async () => {
      const result = await transferCeoRoleAction(undefined, idFormData());
      if (result?.error) toast.error(t(`adminManagement.errors.${result.error}`));
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
        className="border-white/30 bg-white/10 text-white hover:bg-white/20"
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
              className="border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
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

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
            />
          }
        >
          <Crown className="size-4" />
          {t('adminManagement.transferCeo')}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('adminManagement.confirmTransferTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('adminManagement.confirmTransferDescription', { name: adminName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={isTransferPending}
              onClick={handleTransfer}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isTransferPending ? tCommon('loading') : t('adminManagement.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

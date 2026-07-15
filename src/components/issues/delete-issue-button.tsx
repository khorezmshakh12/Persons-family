'use client';

import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
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

/** The board owns the mutation + optimistic remove/restore (see
 * IssuesBoard.handleRequestDelete) — this is just the confirm-then-fire
 * trigger. Now reachable at any status by the issue's own creator or an
 * admin, so a confirm step matters here in a way it didn't when deletion was
 * limited to the Done column. */
export function DeleteIssueButton({ onConfirm }: { onConfirm: () => void }) {
  const t = useTranslations('issues');
  const tCommon = useTranslations('common');

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('delete')}
            className="border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <Trash2 className="size-3.5" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmDeleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('confirmDeleteDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={onConfirm}>
            {t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

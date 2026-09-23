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

/** The parent board owns the mutation + optimistic remove/restore (see
 * TaskBoard.handleRequestDelete) — this component is just the confirm-then-
 * fire trigger, the same split IssueCard already uses for its delete. */
export function DeleteTaskButton({ onConfirm }: { onConfirm: () => void }) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('delete')}
            className="border-au-line bg-au-card text-au-ink hover:bg-au-card-2"
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

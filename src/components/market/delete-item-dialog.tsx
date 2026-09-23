'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { deleteMarketItemAction, type MarketActionState, type MarketItemRow } from '@/lib/actions/market';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function DeleteItemDialog({ item }: { item: MarketItemRow }) {
  const t = useTranslations('market');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);

  const [state, formAction, isPending] = useActionState<MarketActionState, FormData>(
    async (prev, formData) => {
      const result = await deleteMarketItemAction(prev, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        // The action picks the safe removal: a hard delete when nothing
        // references the item, an archive when it already has orders whose
        // records must keep resolving its name.
        toast.success(result?.archived ? t('admin.itemArchived') : t('admin.itemDeleted'));
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('admin.deleteItem')}
            className="border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20"
          />
        }
      >
        <Trash2 className="size-3.5" />
      </AlertDialogTrigger>
      <AlertDialogContent className="border-au-line bg-au-card text-au-ink sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-au-ink">{t('admin.confirmDeleteItemTitle')}</AlertDialogTitle>
          <AlertDialogDescription className="text-au-muted">
            {t('admin.confirmDeleteItemDescription', { name: item.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className="rounded-lg border border-au-line bg-au-card-2 p-3 text-xs text-au-muted">
          {t('admin.deleteArchiveHint')}
        </p>

        {state?.error && (
          <p className="text-destructive px-4 text-sm">{t(`errors.${state.error}`)}</p>
        )}

        <form action={formAction}>
          <input type="hidden" name="itemId" value={item.id} />

          <AlertDialogFooter className="mt-4 gap-2 border-t-0 bg-transparent p-0 sm:gap-0">
            <AlertDialogCancel
              variant="outline"
              className="border-au-line text-au-ink hover:bg-au-card-2"
            >
              {tCommon('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              disabled={isPending}
              variant="destructive"
              className="bg-red-600 font-medium text-white hover:bg-red-700"
            >
              {isPending ? tCommon('loading') : t('admin.deleteItem')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

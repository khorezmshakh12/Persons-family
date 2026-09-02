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
        toast.success(t('admin.itemDeleted'));
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
            className="border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
          />
        }
      >
        <Trash2 className="size-3.5" />
      </AlertDialogTrigger>
      <AlertDialogContent className="border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{t('admin.confirmDeleteItemTitle')}</AlertDialogTitle>
          <AlertDialogDescription className="text-white/70">
            {t('admin.confirmDeleteItemDescription', { name: item.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state?.error && (
          <p className="text-destructive px-4 text-sm">{t(`errors.${state.error}`)}</p>
        )}

        <form action={formAction}>
          <input type="hidden" name="itemId" value={item.id} />

          <AlertDialogFooter className="mt-4 gap-2 border-t-0 bg-transparent p-0 sm:gap-0">
            <AlertDialogCancel
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
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

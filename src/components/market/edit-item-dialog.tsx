'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { updateMarketItemAction, type MarketActionState, type MarketItemRow } from '@/lib/actions/market';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function EditItemDialog({ item }: { item: MarketItemRow }) {
  const t = useTranslations('market');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);

  const [state, formAction, isPending] = useActionState<MarketActionState, FormData>(
    async (prev, formData) => {
      const result = await updateMarketItemAction(prev, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        toast.success(t('admin.itemSaved'));
        setOpen(false);
      }
      return result;
    },
    undefined,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('admin.editItem')}
            className="border-white/20 bg-white/5 text-white hover:bg-white/15"
          />
        }
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t('admin.editItem')}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="itemId" value={item.id} />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-name-${item.id}`}>{t('admin.name')}</Label>
            <Input
              id={`edit-name-${item.id}`}
              name="name"
              required
              defaultValue={item.name}
              maxLength={200}
              className="border-white/20 bg-white/10 text-white"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-description-${item.id}`}>{t('admin.description')}</Label>
            <Textarea
              id={`edit-description-${item.id}`}
              name="description"
              defaultValue={item.description ?? ''}
              maxLength={2000}
              rows={3}
              className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-imageUrl-${item.id}`}>{t('admin.imageUrl')}</Label>
            <Input
              id={`edit-imageUrl-${item.id}`}
              name="imageUrl"
              defaultValue={item.image_url ?? ''}
              maxLength={2000}
              className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-starCost-${item.id}`}>{t('admin.starCost')}</Label>
              <Input
                id={`edit-starCost-${item.id}`}
                name="starCost"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={item.star_cost}
                className="border-white/20 bg-white/10 text-white"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-stock-${item.id}`}>{t('admin.stock')}</Label>
              <Input
                id={`edit-stock-${item.id}`}
                name="stock"
                type="number"
                min={0}
                step={1}
                defaultValue={item.stock !== null ? item.stock : ''}
                placeholder={t('unlimitedStock')}
                className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
              />
            </div>
          </div>
          <p className="text-xs text-white/50">{t('admin.stockHint')}</p>

          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-white/20 text-white hover:bg-white/10"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {isPending ? tCommon('loading') : tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

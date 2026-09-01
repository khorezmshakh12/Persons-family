'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { createMarketItemAction, type MarketActionState } from '@/lib/actions/market';
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

export function CreateItemDialog() {
  const t = useTranslations('market');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);

  const [state, formAction, isPending] = useActionState<MarketActionState, FormData>(
    async (prev, formData) => {
      const result = await createMarketItemAction(prev, formData);
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
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          />
        }
      >
        <Plus className="size-4" />
        {t('admin.addItem')}
      </DialogTrigger>
      <DialogContent className="border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t('admin.addItem')}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-name">{t('admin.name')}</Label>
            <Input
              id="create-name"
              name="name"
              required
              maxLength={200}
              placeholder="e.g. Persons Hoodie"
              className="border-white/20 bg-white/10 text-white"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="create-description">{t('admin.description')}</Label>
            <Textarea
              id="create-description"
              name="description"
              maxLength={2000}
              rows={3}
              placeholder="Reward details..."
              className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="create-imageUrl">{t('admin.imageUrl')}</Label>
            <Input
              id="create-imageUrl"
              name="imageUrl"
              maxLength={2000}
              placeholder="https://..."
              className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-starCost">{t('admin.starCost')}</Label>
              <Input
                id="create-starCost"
                name="starCost"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={10}
                className="border-white/20 bg-white/10 text-white"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-stock">{t('admin.stock')}</Label>
              <Input
                id="create-stock"
                name="stock"
                type="number"
                min={0}
                step={1}
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
              {isPending ? tCommon('loading') : t('admin.addItem')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
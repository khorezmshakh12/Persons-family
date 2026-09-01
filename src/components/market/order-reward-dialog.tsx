'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ShoppingBag, Star, PackageCheck, AlertCircle } from 'lucide-react';
import { placeMarketOrderAction, type MarketItemRow } from '@/lib/actions/market';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function OrderRewardDialog({
  item,
  balance,
  disabled,
}: {
  item: MarketItemRow;
  balance: number;
  disabled?: boolean;
}) {
  const t = useTranslations('market');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const remaining = balance - item.star_cost;
  const isAffordable = balance >= item.star_cost;
  const isAvailable = item.is_active && (item.stock === null || item.stock > 0);

  function handleOrder() {
    startTransition(async () => {
      const result = await placeMarketOrderAction(item.id);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        toast.success(t('orderSuccess'));
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            disabled={disabled || !isAffordable || !isAvailable}
            size="sm"
            className="w-full gap-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          />
        }
      >
        <ShoppingBag className="size-4" />
        {t('order')}
      </DialogTrigger>
      <DialogContent className="border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t('orderConfirm')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {item.image_url ? (
            <div className="relative h-44 w-full overflow-hidden rounded-xl border border-white/15 bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_url}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-28 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/30">
              <PackageCheck className="size-12" />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-lg font-bold text-white">{item.name}</h3>
            {item.description && (
              <p className="text-sm whitespace-pre-wrap text-white/70">{item.description}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-white/5 p-3.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white/70">{t('yourBalance')}:</span>
              <span className="font-semibold text-white">{t('starCount', { count: balance })}</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-2">
              <span className="text-white/70">{t('admin.starCost')}:</span>
              <span className="flex items-center gap-1 font-bold text-amber-300">
                <Star className="size-3.5 fill-amber-300 text-amber-300" />
                {t('starCount', { count: item.star_cost })}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-2 font-medium">
              <span className="text-white/80">{t('remainingBalance', { count: remaining })}</span>
            </div>
          </div>

          {!isAffordable && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              <AlertCircle className="size-4 shrink-0 text-red-400" />
              <span>{t('errors.insufficientStars')}</span>
            </div>
          )}
        </div>

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
            type="button"
            onClick={handleOrder}
            disabled={isPending || !isAffordable}
            className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-semibold"
          >
            {isPending ? tCommon('loading') : t('order')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

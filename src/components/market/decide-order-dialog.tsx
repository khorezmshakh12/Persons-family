'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, X, PackageCheck, AlertTriangle } from 'lucide-react';
import { decideMarketOrderAction, type MarketAdminOrderRow } from '@/lib/actions/market';
import { Button } from '@/components/ui/button';
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

export function DecideOrderActions({
  order,
}: {
  order: MarketAdminOrderRow;
  allowedStatuses?: Array<'approved' | 'rejected' | 'fulfilled'>;
}) {
  const t = useTranslations('market');
  const tCommon = useTranslations('common');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleDecision(status: 'approved' | 'rejected' | 'fulfilled', note?: string) {
    const formData = new FormData();
    formData.set('orderId', order.id);
    formData.set('status', status);
    if (note) formData.set('note', note);

    startTransition(async () => {
      const result = await decideMarketOrderAction(undefined, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        if (status === 'approved') toast.success(t('admin.approveSuccess'));
        else if (status === 'rejected') {
          toast.success(t('admin.rejectSuccess'));
          setRejectOpen(false);
          setRejectNote('');
        } else if (status === 'fulfilled') {
          toast.success(t('admin.fulfillSuccess'));
        }
      }
    });
  }

  const staffFullName = `${order.first_name} ${order.last_name}`;

  return (
    <div className="flex items-center gap-1.5">
      {order.status === 'pending' && (
        <>
          {/* Approve Button */}
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => handleDecision('approved')}
            className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-2.5 shadow-sm"
          >
            <Check className="size-3.5" />
            {t('admin.approve')}
          </Button>

          {/* Reject Dialog */}
          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className="h-8 gap-1 border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 text-xs px-2.5"
                />
              }
            >
              <X className="size-3.5" />
              {t('admin.reject')}
            </DialogTrigger>
            <DialogContent className="border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">{t('admin.reject')}</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-4 py-2">
                <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                  <AlertTriangle className="size-4 shrink-0 text-red-400 mt-0.5" />
                  <span>
                    {t('admin.rejectWarning', {
                      cost: order.star_cost,
                      name: staffFullName,
                    })}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`reject-note-${order.id}`}>{t('admin.rejectPrompt')}</Label>
                  <Textarea
                    id={`reject-note-${order.id}`}
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Reason..."
                    className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRejectOpen(false)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  onClick={() => handleDecision('rejected', rejectNote)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isPending ? tCommon('loading') : t('admin.reject')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Fulfill button */}
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        onClick={() => handleDecision('fulfilled')}
        className="h-8 gap-1 border border-white/20 bg-white/10 text-white hover:bg-white/20 text-xs px-2.5"
      >
        <PackageCheck className="size-3.5" />
        {t('admin.fulfill')}
      </Button>
    </div>
  );
}

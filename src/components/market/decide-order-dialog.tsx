'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { X, AlertTriangle } from 'lucide-react';
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

/** The only two outcomes a pending order can have. */
export type OrderDecision = 'approved' | 'rejected';

/**
 * The green tick that draws itself in once an order is approved.
 *
 * Motion safety: the path's resting `stroke-dashoffset` is 0 (fully drawn) and
 * the keyframe has no fill-mode, so a stalled or disabled animation shows a
 * perfectly ordinary check — never an empty circle.
 */
function DrawnCheck() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="check-draw"
      />
    </svg>
  );
}

/** The post-decision state of a row, shown in place of the buttons until the
 *  server revalidation drops the order out of the pending queue. */
export function DecisionResult({ decision }: { decision: OrderDecision }) {
  const t = useTranslations('market');

  if (decision === 'approved') {
    return (
      <span
        role="status"
        className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300"
      >
        <DrawnCheck />
        {t('status.approved')}
      </span>
    );
  }

  return (
    <span
      role="status"
      className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/50"
    >
      <X className="size-3.5" />
      {t('status.rejected')}
    </span>
  );
}

/**
 * Approve / Reject — the CEO's only two moves on a pending order.
 *
 * Approving is one click (the stars were already debited when the employee
 * ordered). Rejecting opens a dialog for an optional reason, because the
 * rejection refunds the stars and the employee gets that reason on Telegram.
 */
export function DecideOrderActions({
  order,
  onDecided,
}: {
  order: MarketAdminOrderRow;
  /** Lets the surrounding row switch to its decided styling in the same beat. */
  onDecided?: (decision: OrderDecision) => void;
}) {
  const t = useTranslations('market');
  const tCommon = useTranslations('common');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [decision, setDecision] = useState<OrderDecision | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDecision(status: OrderDecision, note?: string) {
    const formData = new FormData();
    formData.set('orderId', order.id);
    formData.set('status', status);
    if (note) formData.set('note', note);

    startTransition(async () => {
      const result = await decideMarketOrderAction(undefined, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      if (status === 'approved') {
        toast.success(t('admin.approveSuccess'));
      } else {
        toast.success(t('admin.rejectSuccess'));
        setRejectOpen(false);
        setRejectNote('');
      }
      setDecision(status);
      onDecided?.(status);
    });
  }

  if (decision) return <DecisionResult decision={decision} />;

  const staffFullName = `${order.first_name} ${order.last_name}`;

  return (
    <div className="flex items-center gap-1.5">
      {/* Approve */}
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        onClick={() => handleDecision('approved')}
        className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-2.5 shadow-sm"
      >
        <DrawnCheck />
        {t('admin.approve')}
      </Button>

      {/* Reject (with an optional reason) */}
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
                placeholder={t('admin.rejectPlaceholder')}
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
              type="button"
              disabled={isPending}
              onClick={() => handleDecision('rejected', rejectNote)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isPending ? tCommon('loading') : t('admin.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

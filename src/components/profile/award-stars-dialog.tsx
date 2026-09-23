'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Sparkles, AlertTriangle, PlusCircle, MinusCircle } from 'lucide-react';
import { awardStarsAction, type StarsActionState } from '@/lib/actions/stars';
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
import { cn } from '@/lib/utils';

export function AwardStarsDialog({
  userId,
  staffName,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: {
  userId: string;
  staffName?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations('profile.stars');
  const tCommon = useTranslations('common');
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (isControlled) setControlledOpen?.(val);
    else setInternalOpen(val);
  };

  const [mode, setMode] = useState<'award' | 'deduct'>('award');
  const [amount, setAmount] = useState<number | ''>(1);

  const [state, formAction, isPending] = useActionState<StarsActionState, FormData>(
    async (prev, formData) => {
      const numAmount = Math.max(1, Math.floor(Number(formData.get('amount')) || 1));
      const isDeduct = formData.get('mode') === 'deduct';
      const signedDelta = isDeduct ? -numAmount : numAmount;

      formData.set('delta', String(signedDelta));
      const result = await awardStarsAction(prev, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else {
        toast.success(t('success'));
        setOpen(false);
        setAmount(1);
      }
      return result;
    },
    undefined,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger as React.ReactElement} />
      ) : (
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-amber-400/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
            />
          }
        >
          <Sparkles className="size-4" />
          {t('manageStars')}
        </DialogTrigger>
      )}
      <DialogContent className="border-au-line bg-au-card text-au-ink sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-au-ink">
            {t('manageStars')}{staffName ? ` — ${staffName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="mode" value={mode} />

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-au-line bg-au-card-2 p-1">
            <button
              type="button"
              onClick={() => setMode('award')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all',
                mode === 'award'
                  ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/40 shadow-sm'
                  : 'text-au-muted hover:text-au-ink hover:bg-au-card-2',
              )}
            >
              <PlusCircle className="size-4" />
              {t('awardStars')}
            </button>
            <button
              type="button"
              onClick={() => setMode('deduct')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all',
                mode === 'deduct'
                  ? 'bg-red-500/20 text-red-700 border border-red-500/40 shadow-sm'
                  : 'text-au-muted hover:text-au-ink hover:bg-au-card-2',
              )}
            >
              <MinusCircle className="size-4" />
              {t('deductStars')}
            </button>
          </div>

          {/* Deduct Warning Alert */}
          {mode === 'deduct' && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700">
              <AlertTriangle className="size-4 shrink-0 text-red-600 mt-0.5" />
              <span>{t('deductWarning')}</span>
            </div>
          )}

          {/* Amount input */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">{t('amount')}</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              required
              className="border-au-line bg-au-card text-au-ink"
            />
          </div>

          {/* Reason input */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">{t('reason')}</Label>
            <Textarea
              id="reason"
              name="reason"
              maxLength={500}
              rows={3}
              placeholder={t('reasonPlaceholder')}
              className="border-au-line bg-au-card text-au-ink placeholder:text-au-faint"
            />
          </div>

          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-au-line text-au-ink hover:bg-au-card-2"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isPending || amount === '' || Number(amount) < 1}
              className={cn(
                mode === 'deduct'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-au-primary hover:bg-black text-white',
              )}
            >
              {isPending
                ? tCommon('loading')
                : mode === 'deduct'
                  ? t('deductStars')
                  : t('awardStars')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

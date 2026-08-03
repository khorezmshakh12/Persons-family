'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { reviewContractRequestAction } from '@/lib/actions/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function ReviewContractRequestControls({
  requestId,
  requestType,
}: {
  requestId: string;
  requestType: 'freeze' | 'extend';
}) {
  const t = useTranslations('profile.contracts');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(decision: 'approved' | 'rejected', newEndDate?: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('requestId', requestId);
      formData.set('decision', decision);
      if (newEndDate) formData.set('newEndDate', newEndDate);
      const result = await reviewContractRequestAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
      else setOpen(false);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => submit('rejected')}
        className="border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
      >
        <X className="size-3.5" />
        {t('reject')}
      </Button>
      {requestType === 'freeze' ? (
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => submit('approved')}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Check className="size-3.5" />
          {t('approve')}
        </Button>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700" />
            }
          >
            <Check className="size-3.5" />
            {t('approve')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('approveExtendTitle')}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const newEndDate = (
                  e.currentTarget.elements.namedItem('newEndDate') as HTMLInputElement
                ).value;
                submit('approved', newEndDate);
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor={`newEndDate-${requestId}`}>{t('newEndDate')}</Label>
                <Input id={`newEndDate-${requestId}`} name="newEndDate" type="date" required />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? tCommon('loading') : t('approve')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

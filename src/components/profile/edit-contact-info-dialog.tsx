'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { updateOwnContactInfoAction, type ProfileActionState } from '@/lib/actions/profile';
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

export function EditContactInfoDialog({
  defaultEmergencyContact,
}: {
  defaultEmergencyContact: string;
}) {
  const t = useTranslations('profile.contactInfo');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ProfileActionState, FormData>(
    updateOwnContactInfoAction,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success(t('successToast'));
      setOpen(false);
    } else if (state.error) {
      toast.error(t(`errors.${state.error}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <Pencil className="size-3.5" />
        {t('edit')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="emergencyContact">{t('emergencyContact')}</Label>
            <Input
              id="emergencyContact"
              name="emergencyContact"
              defaultValue={defaultEmergencyContact}
              maxLength={255}
              placeholder={t('emergencyContactPlaceholder')}
            />
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

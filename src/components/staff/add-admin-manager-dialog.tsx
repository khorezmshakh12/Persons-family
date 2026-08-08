'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createAdminManagerAction } from '@/lib/actions/staff';
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
import { TempPasswordResult } from './temp-password-result';

/** IT Developer's one narrow staff-management capability — creating an
 * Administrative Manager account. No role picker (always admin_manager) and
 * no avatar step, unlike AddStaffDialog: this only needs to cover what was
 * asked for, not mirror the full ceo/admin_manager creation flow. */
export function AddAdminManagerDialog() {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      setTempPassword(null);
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAdminManagerAction(undefined, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setTempPassword(result?.tempPassword ?? null);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t('addAdminManager')}
      </DialogTrigger>
      <DialogContent>
        {tempPassword ? (
          <TempPasswordResult tempPassword={tempPassword} onDone={() => handleOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('addAdminManager')}</DialogTitle>
            </DialogHeader>
            <form action={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="firstName">{t('firstName')}</Label>
                  <Input id="firstName" name="firstName" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="lastName">{t('lastName')}</Label>
                  <Input id="lastName" name="lastName" required />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">{t('phone')}</Label>
                <Input id="phone" name="phone" type="tel" placeholder="+998 90 123 45 67" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="telegramId">{t('telegramId')}</Label>
                <Input id="telegramId" name="telegramId" type="number" inputMode="numeric" required />
                <p className="text-muted-foreground text-xs">{t('telegramIdHint')}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dateOfBirth">{t('dateOfBirth')}</Label>
                <Input id="dateOfBirth" name="dateOfBirth" type="date" required />
              </div>
              {error && <p className="text-destructive text-sm">{t(`errors.${error}`)}</p>}
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? tCommon('loading') : t('create')}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

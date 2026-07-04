'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createStaffAction, type StaffActionState } from '@/lib/actions/staff';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TempPasswordResult } from './temp-password-result';

const ALL_ROLES = ['ceo', 'admin_manager', 'teacher', 'assistant'] as const;

export function AddStaffDialog({ canAssignCeo }: { canAssignCeo: boolean }) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<StaffActionState, FormData>(
    createStaffAction,
    undefined,
  );

  const roles = canAssignCeo ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'ceo');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t('addStaff')}
      </DialogTrigger>
      <DialogContent>
        {state?.tempPassword ? (
          <TempPasswordResult tempPassword={state.tempPassword} onDone={() => setOpen(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('addStaff')}</DialogTitle>
            </DialogHeader>
            <form action={formAction} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
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
                <Label htmlFor="dateOfBirth">{t('dateOfBirth')}</Label>
                <Input id="dateOfBirth" name="dateOfBirth" type="date" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role">{t('role')}</Label>
                <Select name="role" defaultValue="teacher">
                  <SelectTrigger id="role" className="w-full">
                    <SelectValue>{(value: string) => t(`roles.${value}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="avatar">{t('avatar')}</Label>
                <Input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg" />
                <p className="text-muted-foreground text-xs">{t('avatarOptional')}</p>
              </div>
              {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
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

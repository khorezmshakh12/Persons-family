'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { updateStaffAction, type StaffActionState } from '@/lib/actions/staff';
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
import type { Profile } from '@/lib/auth/session';

const ALL_ROLES = ['ceo', 'admin_manager', 'teacher', 'assistant'] as const;

export function EditStaffDialog({
  profile,
  canAssignCeo,
}: {
  profile: Profile;
  canAssignCeo: boolean;
}) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<StaffActionState, FormData>(
    updateStaffAction,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) setOpen(false);
  }, [state]);

  const roles = canAssignCeo ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'ceo');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-4" />
        {t('edit')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editStaff')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={profile.id} />
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`firstName-${profile.id}`}>{t('firstName')}</Label>
              <Input
                id={`firstName-${profile.id}`}
                name="firstName"
                defaultValue={profile.first_name}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`lastName-${profile.id}`}>{t('lastName')}</Label>
              <Input
                id={`lastName-${profile.id}`}
                name="lastName"
                defaultValue={profile.last_name}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`phone-${profile.id}`}>{t('phone')}</Label>
            <Input
              id={`phone-${profile.id}`}
              name="phone"
              type="tel"
              defaultValue={profile.phone}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`dob-${profile.id}`}>{t('dateOfBirth')}</Label>
            <Input
              id={`dob-${profile.id}`}
              name="dateOfBirth"
              type="date"
              defaultValue={profile.date_of_birth}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`role-${profile.id}`}>{t('role')}</Label>
            <Select name="role" defaultValue={profile.role}>
              <SelectTrigger id={`role-${profile.id}`} className="w-full">
                <SelectValue />
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
            <Label htmlFor={`avatar-${profile.id}`}>{t('avatar')}</Label>
            <Input id={`avatar-${profile.id}`} name="avatar" type="file" accept="image/png,image/jpeg" />
            <p className="text-muted-foreground text-xs">{t('avatarOptional')}</p>
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

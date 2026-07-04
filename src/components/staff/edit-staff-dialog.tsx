'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { updateStaffAction, requestAvatarUploadUrlAction } from '@/lib/actions/staff';
import { AVATAR_ALLOWED_TYPES, AVATAR_MAX_FILE_BYTES } from '@/lib/avatar-constants';
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const roles = canAssignCeo ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'ceo');

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const avatarFile = formData.get('avatar');
      formData.delete('avatar');

      if (avatarFile instanceof File && avatarFile.size > 0) {
        if (avatarFile.size > AVATAR_MAX_FILE_BYTES) {
          setError('avatarTooLarge');
          return;
        }
        if (!AVATAR_ALLOWED_TYPES[avatarFile.type]) {
          setError('invalidAvatarType');
          return;
        }

        const uploadUrlResult = await requestAvatarUploadUrlAction(
          profile.id,
          avatarFile.name,
          avatarFile.type,
        );
        if (uploadUrlResult.error || !uploadUrlResult.path || !uploadUrlResult.token) {
          setError(uploadUrlResult.error ?? 'uploadFailed');
          return;
        }

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .uploadToSignedUrl(uploadUrlResult.path, uploadUrlResult.token, avatarFile, {
            contentType: avatarFile.type,
          });
        if (uploadError) {
          setError('uploadFailed');
          return;
        }

        formData.set('avatarPath', uploadUrlResult.path);
      }

      const result = await updateStaffAction(undefined, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }

      setOpen(false);
    });
  }

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
        <form action={handleSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={profile.id} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Label htmlFor={`avatar-${profile.id}`}>{t('avatar')}</Label>
            <Input id={`avatar-${profile.id}`} name="avatar" type="file" accept="image/png,image/jpeg" />
            <p className="text-muted-foreground text-xs">{t('avatarOptional')}</p>
          </div>
          {error && <p className="text-destructive text-sm">{t(`errors.${error}`)}</p>}
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

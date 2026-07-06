'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createStaffAction, requestAvatarUploadUrlAction, attachAvatarAction } from '@/lib/actions/staff';
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
import { TempPasswordResult } from './temp-password-result';

const ALL_ROLES = ['ceo', 'admin_manager', 'teacher', 'assistant', 'smm', 'mobilgrof', 'it_developer'] as const;

export function AddStaffDialog({ canAssignCeo }: { canAssignCeo: boolean }) {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Only the CEO can grant either elevated role — an admin_manager creating
  // a new hire never sees 'ceo' or 'admin_manager' as options (matches the
  // server-side check in createStaffAction, which would reject either).
  const roles = canAssignCeo ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'ceo' && r !== 'admin_manager');

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
      }

      const result = await createStaffAction(undefined, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }

      // Uploads go straight from the browser to Supabase Storage using a
      // signed URL, never through this Next.js server — that's what lets
      // files exceed Vercel's 4.5MB serverless function payload limit.
      if (avatarFile instanceof File && avatarFile.size > 0 && result?.userId) {
        const uploadUrlResult = await requestAvatarUploadUrlAction(
          result.userId,
          avatarFile.name,
          avatarFile.type,
        );
        if (!uploadUrlResult.error && uploadUrlResult.path && uploadUrlResult.token) {
          const supabase = createClient();
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .uploadToSignedUrl(uploadUrlResult.path, uploadUrlResult.token, avatarFile, {
              contentType: avatarFile.type,
            });
          if (!uploadError) {
            await attachAvatarAction(result.userId, uploadUrlResult.path);
          }
        }
      }

      setTempPassword(result?.tempPassword ?? null);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t('addStaff')}
      </DialogTrigger>
      <DialogContent>
        {tempPassword ? (
          <TempPasswordResult tempPassword={tempPassword} onDone={() => handleOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('addStaff')}</DialogTitle>
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

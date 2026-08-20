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
import { TeacherLevelBadge } from './teacher-level-badge';
import { INTERNSHIP_LEVELS } from '@/lib/internship-level';
import type { Profile } from '@/lib/auth/session';

const ALL_ROLES = [
  'ceo',
  'admin_manager',
  'teacher',
  'head_teacher',
  'assistant',
  'mmd',
  'internship',
  'it_developer',
] as const;

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

  // Only the CEO can grant either elevated role, but the target's own
  // current role always stays selectable (a no-op resubmission, e.g. an
  // admin_manager editing their own profile) even when it wouldn't
  // otherwise be offered as a new choice.
  const roles = canAssignCeo
    ? ALL_ROLES
    : ALL_ROLES.filter((r) => r === profile.role || (r !== 'ceo' && r !== 'admin_manager'));

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
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="border-white/30 bg-white/10 text-white hover:bg-white/20" />}
      >
        <Pencil className="size-4" />
        {t('edit')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editStaff')}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={profile.id} />
          <input type="hidden" name="staffId" value={profile.id} />
          {profile.role === 'teacher' && (
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-xs">{t('teacherLevel')}</Label>
              <TeacherLevelBadge level={profile.teacher_level} />
              <span className="text-muted-foreground text-xs">{t('teacherLevelHint')}</span>
            </div>
          )}
          {profile.role === 'internship' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`internshipLevel-${profile.id}`}>{t('internshipLevel')}</Label>
              <Select name="internshipLevel" defaultValue={profile.internship_level}>
                <SelectTrigger id={`internshipLevel-${profile.id}`} className="w-full">
                  <SelectValue>{(value: string) => value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {INTERNSHIP_LEVELS.map((lvl) => (
                    <SelectItem key={lvl} value={lvl}>
                      {lvl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
            <Button type="submit" loading={isPending}>
              {isPending ? tCommon('loading') : t('saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

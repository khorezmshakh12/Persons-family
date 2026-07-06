'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { updateStaffAction, requestAvatarUploadUrlAction } from '@/lib/actions/staff';
import { updateStaffPerformanceAction } from '@/lib/actions/staff-performance';
import { AVATAR_ALLOWED_TYPES, AVATAR_MAX_FILE_BYTES } from '@/lib/avatar-constants';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from './currency-input';
import type { Profile } from '@/lib/auth/session';
import type { Database } from '@/lib/supabase/types';

type StaffPerformance = Database['public']['Tables']['staff_performance']['Row'];

const ALL_ROLES = ['ceo', 'admin_manager', 'teacher', 'assistant'] as const;

export function EditStaffDialog({
  profile,
  canAssignCeo,
  performance,
}: {
  profile: Profile;
  canAssignCeo: boolean;
  performance: StaffPerformance | null;
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

      const performanceResult = await updateStaffPerformanceAction(undefined, formData);
      if (performanceResult?.error) {
        setError(performanceResult.error);
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

          <div className="flex flex-col gap-4 rounded-lg border p-3">
            <h3 className="text-sm font-medium">{t('performance.title')}</h3>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`tier-${profile.id}`}>{t('performance.tier')}</Label>
              <Select name="currentTier" defaultValue={performance?.current_tier ?? 'C'}>
                <SelectTrigger id={`tier-${profile.id}`} className="w-full">
                  <SelectValue>{(value: string) => t(`performance.tierLabels.${value}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(['A', 'B', 'C'] as const).map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {t(`performance.tierLabels.${tier}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`monthsInTier-${profile.id}`}>{t('performance.monthsInTier')}</Label>
                <Input
                  id={`monthsInTier-${profile.id}`}
                  name="monthsInTier"
                  type="number"
                  min={0}
                  max={6}
                  defaultValue={performance?.months_in_tier ?? 0}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`weeklyProgressScore-${profile.id}`}>
                  {t('performance.weeklyProgressScore')}
                </Label>
                <Input
                  id={`weeklyProgressScore-${profile.id}`}
                  name="weeklyProgressScore"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={performance?.weekly_progress_score ?? 0}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`bonus-${profile.id}`}>{t('performance.bonus')}</Label>
                <CurrencyInput
                  id={`bonus-${profile.id}`}
                  name="bonus"
                  defaultValue={performance?.bonus ?? 0}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`penalty-${profile.id}`}>{t('performance.penalty')}</Label>
                <CurrencyInput
                  id={`penalty-${profile.id}`}
                  name="penalty"
                  defaultValue={performance?.penalty ?? 0}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`notes-${profile.id}`}>{t('performance.notes')}</Label>
              <Textarea
                id={`notes-${profile.id}`}
                name="notes"
                defaultValue={performance?.notes ?? ''}
                placeholder={t('performance.notesPlaceholder')}
              />
            </div>
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

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { updateOwnProfileAction, updateOwnAvatarAction, type ProfileActionState } from '@/lib/actions/profile';
import { AVATAR_ALLOWED_TYPES, AVATAR_MAX_FILE_BYTES } from '@/lib/avatar-constants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfile } from '@/components/app-shell/profile-context';
import { TeacherLevelBadge } from '@/components/staff/teacher-level-badge';
import type { TeacherLevel } from '@/lib/teacher-level';
import type { Database } from '@/lib/supabase/types';

const GLASS_INPUT =
  'rounded-xl border border-white/30 bg-transparent px-4 py-3 text-white placeholder:text-gray-300 focus-visible:border-teal-400 focus-visible:ring-0';

export function ProfileSection({
  userId,
  role,
  teacherLevel,
}: {
  userId: string;
  role: Database['public']['Enums']['staff_role'];
  teacherLevel: TeacherLevel;
}) {
  const t = useTranslations('settings.profile');
  const { firstName, lastName, avatarUrl, updateProfile } = useProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [state, formAction, isPending] = useActionState<ProfileActionState, FormData>(
    updateOwnProfileAction,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success(t('successToast'));
      if (state.firstName !== undefined && state.lastName !== undefined) {
        updateProfile({ firstName: state.firstName, lastName: state.lastName });
      }
    } else if (state.error) {
      toast.error(t(`errors.${state.error}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ext = AVATAR_ALLOWED_TYPES[file.type];
    if (!ext) {
      toast.error(t('errors.invalidAvatarType'));
      return;
    }
    if (file.size > AVATAR_MAX_FILE_BYTES) {
      toast.error(t('errors.avatarTooLarge'));
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const supabase = createClient();
      const path = `${userId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        console.error('Avatar upload failed', uploadError);
        toast.error(`${t('errors.uploadFailed')}: ${uploadError.message}`);
        return;
      }

      const result = await updateOwnAvatarAction(path);
      if (result.error || !result.avatarUrl) {
        toast.error(t('errors.uploadFailed'));
        return;
      }

      updateProfile({ avatarUrl: result.avatarUrl });
      toast.success(t('avatarUpdated'));
    } catch (err) {
      console.error('Avatar upload failed', err);
      toast.error(t('errors.uploadFailed'));
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploadingAvatar}
          aria-label={t('changeAvatar')}
          className="tap-scale group relative size-20 shrink-0 cursor-pointer rounded-full outline-none transition-transform duration-200 ease-bounce hover:scale-105 focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          <Avatar className="size-20 border border-white/30">
            <AvatarImage src={avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="bg-white/10 text-lg text-white">
              {`${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-6 text-white" />
          </span>
          {isUploadingAvatar && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
              <Loader2 className="size-6 animate-spin text-white" />
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleAvatarChange}
        />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">
              {firstName} {lastName}
            </p>
            {role === 'teacher' && <TeacherLevelBadge level={teacherLevel} />}
          </div>
          <p className="text-xs text-white/60">{t('avatarHint')}</p>
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName" className="text-white/90">
            {t('fullName')}
          </Label>
          <Input
            id="fullName"
            name="fullName"
            required
            defaultValue={`${firstName} ${lastName}`}
            className={GLASS_INPUT}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword" className="text-white/90">
              {t('newPassword')}
            </Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder={t('passwordPlaceholder')}
              className={GLASS_INPUT}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword" className="text-white/90">
              {t('confirmPassword')}
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder={t('passwordPlaceholder')}
              className={GLASS_INPUT}
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="w-fit bg-gradient-to-r from-teal-400 to-emerald-500 text-white hover:opacity-90"
        >
          {isPending ? t('saving') : t('saveChanges')}
        </Button>
      </form>
    </div>
  );
}

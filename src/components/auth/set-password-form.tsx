'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { setPasswordAction, type AuthActionState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SetPasswordForm() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    setPasswordAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('newPassword')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? tCommon('loading') : t('setPassword')}
      </Button>
    </form>
  );
}

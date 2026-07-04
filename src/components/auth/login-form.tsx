'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { loginAction, type AuthActionState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    loginAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">{t('phone')}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="+998 90 123 45 67"
          autoComplete="tel"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? tCommon('loading') : t('login')}
      </Button>
    </form>
  );
}
